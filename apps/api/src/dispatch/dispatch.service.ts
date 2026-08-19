import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import { datedReference } from '../common/codes';
import {
  DispatchStatus,
  ReceiptStatus,
  DEFAULT_FREIGHT_AMOUNT,
  type AddDispatchPackageInput,
  type AssignToStopInput,
  type CreateDispatchInput,
  type CreateDispatchStopInput,
  type DispatchListQuery,
  type QuickDispatchInput,
  type UpdateDispatchStopInput,
  type UpdateWaybillInput,
} from '@lojistik/shared';

/** Taşıma irsaliyesi satırı için kabulden gereken alanlar: kim gönderdi (customer),
 *  nereden (warehouse), kime (ön ihbardaki alıcı) — VUK 209 zorunlu içeriği. */
const RECEIPT_FOR_WAYBILL = {
  reference: true,
  waybillNo: true,
  customer: { select: { name: true } },
  warehouse: { select: { name: true } },
  lines: { select: { description: true } }, // MALIN CİNSİ sütunu
  shipment: {
    select: {
      vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
      recipientCustomer: { select: { id: true, name: true } },
      recipients: { select: { label: true, address: true } },
    },
  },
} satisfies Prisma.ReceiptSelect;

const DISPATCH_INCLUDE = {
  vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
  // items = "araçta ne var" sorusunun TEK kaynağı (kap ve kalem satırları birlikte)
  items: {
    include: {
      receipt: { select: RECEIPT_FOR_WAYBILL },
      package: { select: { id: true, code: true, type: true } },
      receiptLine: { select: { id: true, sku: true, unit: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  packages: {
    include: { receipt: { select: RECEIPT_FOR_WAYBILL } },
    orderBy: { createdAt: 'asc' as const },
  },
  // DORMANT: kabul düzeyi sevkler (yeni kayıt yazılmaz; eski kayıtlar için okunur)
  receipts: {
    select: {
      id: true,
      reference: true,
      stopId: true,
      customer: { select: { name: true } },
      warehouse: { select: { name: true } },
      shipment: { select: { recipientCustomer: { select: { name: true } } } },
      lines: { select: { countedQty: true, description: true } },
    },
  },
  // Çok duraklı teslimat — rota sırasına göre
  stops: {
    orderBy: { seq: 'asc' as const },
    include: {
      _count: { select: { items: true } },
      // ALICI = firma. `name` boşaltma NOKTASININ adı ("Gökbil Depo") olabilir;
      // irsaliyede "kime gönderildiği" firma unvanı olmalı (VUK 209).
      customer: { select: { name: true } },
    },
  },
} satisfies Prisma.DispatchInclude;

type DispatchWithRelations = Prisma.DispatchGetPayload<{ include: typeof DISPATCH_INCLUDE }>;

/** Yükleme girişi: ya bir palet (kap) ya da bir kabul kalemi + miktar. */
export type LoadEntry = {
  packageId?: string;
  receiptLineId?: string;
  qty?: number;
  stopId?: string | null;
};

/** MALIN CİNSİ: tek kalemse açıklaması, çok kalemse "Muhtelif". */
function describeLines(lines: { description: string }[]): string {
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0].description;
  return 'Muhtelif';
}

/** Decimal(12,3) kolonuna yazılacak kilo — float gürültüsünü kırp. */
const kg = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Kısmi sevkte kalemin kilosu: kalemin TOPLAM kilosunun sevk edilen orana düşen kısmı.
 * Kilo girilmemişse (null) belge hücresi boş kalır — elle doldurulmaya devam edilebilir.
 */
function portionWeight(
  total: Prisma.Decimal | null,
  qty: number,
  countedQty: number,
): number | null {
  if (total === null || countedQty <= 0) return null;
  return kg(Number(total) * (qty / countedQty));
}

/**
 * Bir paletin kilosu. Palet ile kalem arasında bağ YOK (tek-granülerlik kuralı), bu yüzden
 * kabulün toplam kilosu palet sayısına eşit paylaştırılır — kısmi palet sevkinde belgeye
 * yaklaşık ama tutarlı bir KİLO basılır. Hiç kilo girilmemişse null.
 */
function perPackageWeight(
  lines: { weightKg: Prisma.Decimal | null }[],
  packageCount: number,
): number | null {
  if (packageCount <= 0) return null;
  const withKg = lines.filter((l) => l.weightKg !== null);
  if (withKg.length === 0) return null;
  const total = withKg.reduce((sum, l) => sum + Number(l.weightKg), 0);
  return kg(total / packageCount);
}

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: DispatchListQuery) {
    const { page, pageSize, search, status } = query;
    const where: Prisma.DispatchWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { destination: { contains: search, mode: 'insensitive' } },
              { vehiclePlate: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.dispatch.findMany({
        where,
        include: DISPATCH_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.dispatch.count({ where }),
    ]);
    return paginate(items.map(serializeDispatch), total, page, pageSize);
  }

  async findOne(id: string) {
    return serializeDispatch(await this.getOrThrow(id));
  }

  async create(input: CreateDispatchInput) {
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      try {
        const created = await this.prisma.dispatch.create({
          data: {
            reference: datedReference('SVK'),
            status: DispatchStatus.DRAFT,
            destination: input.destination,
            vehicleId: input.vehicleId || null,
            vehiclePlate: input.vehiclePlate,
            driverName: input.driverName,
            notes: input.notes,
            freightAmount: DEFAULT_FREIGHT_AMOUNT,
            // KDV dahil: belgedeki GEN. TOP tam 1,00 ₺ okunsun (hariç olsaydı 1,20 çıkardı)
            freightVatIncluded: true,
          },
          include: DISPATCH_INCLUDE,
        });
        return serializeDispatch(created);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /**
   * Hızlı sevk: bir kabulün depodaki TÜM paletlerini, planlanan (ya da seçilen kayıtlı)
   * araçla tek adımda sevk eder. Operatör plaka yazmaz; sevkiyat anında tamamlanır.
   */
  async quickDispatch(input: QuickDispatchInput, userId: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: input.receiptId },
      include: {
        customer: { select: { name: true } },
        shipment: { select: { vehicleId: true } },
        packages: { where: { dispatchedAt: null, dispatchId: null }, select: { id: true } },
        lines: { select: { id: true, countedQty: true, dispatchedQty: true } },
      },
    });
    if (!receipt) throw new NotFoundException('Mal kabul kaydı bulunamadı');
    if (receipt.status !== ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Bu kabulün mal kabulü henüz tamamlanmadı');
    }
    const palletIds = receipt.packages.map((p) => p.id);
    const paletless = palletIds.length === 0;
    // Paletsiz kabul: kalan miktarların tamamı yüklenir (kısmi sevk sonrası kalan da sevk edilebilir)
    const openLines = paletless
      ? receipt.lines.filter((l) => l.countedQty - l.dispatchedQty > 0)
      : [];
    if (paletless && openLines.length === 0) {
      throw new BadRequestException('Bu mal kabulde depoda kalan yük yok');
    }

    const vehicleId = input.vehicleId || receipt.shipment?.vehicleId || null;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) throw new BadRequestException('Geçersiz araç seçimi');
    }
    const destination = input.destination?.trim() || receipt.customer?.name || 'SEVKİYAT';

    const now = new Date();
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      try {
        const dispatch = await this.prisma.$transaction(async (tx) => {
          const created = await tx.dispatch.create({
            data: {
              reference: datedReference('SVK'),
              status: DispatchStatus.DISPATCHED,
              destination,
              vehicleId,
              dispatchedAt: now,
              dispatchedById: userId,
              freightAmount: DEFAULT_FREIGHT_AMOUNT,
              freightVatIncluded: true,
            },
          });
          // Tek huni: paletsizse kalan kalemler, paletliyse depodaki paletler
          const entries: LoadEntry[] = paletless
            ? openLines.map((l) => ({ receiptLineId: l.id, qty: l.countedQty - l.dispatchedQty }))
            : palletIds.map((pid) => ({ packageId: pid }));
          await this.loadItems(created.id, entries, tx, { dispatchedAt: now });
          return tx.dispatch.findUniqueOrThrow({
            where: { id: created.id },
            include: DISPATCH_INCLUDE,
          });
        });
        await this.audit('dispatch.quick', dispatch.id, userId, {
          receiptId: input.receiptId,
          palletCount: palletIds.length,
        });
        return serializeDispatch(dispatch);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  /** Palet ekle (QR okutarak ya da id ile). Her çağrı tek bir paleti ekler. */
  async addPackage(id: string, input: AddDispatchPackageInput) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);

    const where = input.packageId
      ? { id: input.packageId }
      : { code: input.packageCode!.trim() };
    const pkg = await this.prisma.package.findUnique({
      where,
      include: { receipt: { select: { status: true } } },
    });

    if (!pkg) throw new NotFoundException('Palet (QR) bulunamadı');
    if (pkg.receipt.status !== ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Bu paletin mal kabulü henüz tamamlanmadı');
    }
    if (pkg.dispatchedAt) throw new BadRequestException('Bu palet zaten sevk edilmiş');
    if (pkg.dispatchId && pkg.dispatchId !== id) {
      throw new BadRequestException('Bu palet başka bir sevkiyatta');
    }

    // "Girişin tümü" ise o kabuldeki depodaki tüm paletler, değilse tek palet
    const targets = input.wholeReceipt
      ? await this.prisma.package.findMany({
          where: { receiptId: pkg.receiptId, dispatchedAt: null, dispatchId: null },
          select: { id: true },
        })
      : pkg.dispatchId === id
        ? []
        : [{ id: pkg.id }];

    if (targets.length) {
      await this.prisma.$transaction((tx) =>
        this.loadItems(id, targets.map((t) => ({ packageId: t.id })), tx),
      );
    }
    return this.findOne(id);
  }

  /** Toplu palet ekleme: depodaki uygun paletleri (tamamlanmış kabul, sevk edilmemiş) tek seferde ekler. */
  async addPackages(id: string, packageIds: string[]) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    const usable = await this.prisma.package.findMany({
      where: { id: { in: packageIds }, dispatchedAt: null, dispatchId: null },
      select: { id: true },
    });
    if (usable.length) {
      await this.prisma.$transaction((tx) =>
        this.loadItems(id, usable.map((p) => ({ packageId: p.id })), tx),
      );
    }
    return this.findOne(id);
  }

  /** Yükü sevkiyattan çıkar (palet ya da kalem). Defter satırı silinir, sayaç/ayna geri alınır. */
  async removeItem(id: string, itemId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    const item = await this.prisma.dispatchItem.findUnique({ where: { id: itemId } });
    if (!item || item.dispatchId !== id) throw new NotFoundException('Yük satırı bulunamadı');
    await this.prisma.$transaction((tx) => this.unloadItems([item], tx));
    return this.findOne(id);
  }

  /** Geriye uyum: palet id'si ile çıkarma (eski UI yolu). */
  async removePackage(id: string, packageId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    const item = await this.prisma.dispatchItem.findFirst({ where: { dispatchId: id, packageId } });
    if (item) {
      await this.prisma.$transaction((tx) => this.unloadItems([item], tx));
    } else {
      // Defterde yoksa (teorik) yalnız aynayı temizle
      await this.prisma.package.updateMany({
        where: { id: packageId, dispatchId: id },
        data: { dispatchId: null, stopId: null },
      });
    }
    return this.findOne(id);
  }

  /** Kalem/palet seçerek yükle — kalem bazlı sevkin ana girişi. */
  async addItems(id: string, entries: LoadEntry[], userId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    const created = await this.prisma.$transaction((tx) => this.loadItems(id, entries, tx));
    await this.audit('dispatch.itemsAdded', id, userId, { count: created });
    return this.findOne(id);
  }

  async complete(id: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    if (dispatch.items.length === 0) {
      throw new BadRequestException('Sevkiyata en az bir yük ekleyin');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // Ayna: paletlerin sevk zamanı
      await tx.package.updateMany({ where: { dispatchId: id }, data: { dispatchedAt: now } });
      return tx.dispatch.update({
        where: { id },
        data: { status: DispatchStatus.DISPATCHED, dispatchedAt: now, dispatchedById: userId },
        include: DISPATCH_INCLUDE,
      });
    });
    await this.audit('dispatch.completed', id, userId, { itemCount: updated.items.length });
    return serializeDispatch(updated);
  }

  /** Sevkiyatın aracını değiştir (yanlış plaka düzeltme). İptal edilmiş sevkiyatta yapılamaz. */
  async changeVehicle(id: string, vehicleId: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    if (dispatch.status === DispatchStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş sevkiyatın aracı değiştirilemez');
    }
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new BadRequestException('Geçersiz araç seçimi');
    const updated = await this.prisma.dispatch.update({
      where: { id },
      data: {
        vehicleId: vehicle.id,
        // Eski (elle) plaka/sürücü alanlarını da güncel araca göre eşle
        vehiclePlate: vehicle.plate,
        driverName: vehicle.driverName,
      },
      include: DISPATCH_INCLUDE,
    });
    await this.audit('dispatch.vehicleChanged', id, userId, { vehicleId: vehicle.id });
    return serializeDispatch(updated);
  }

  async cancel(id: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    if (dispatch.status === DispatchStatus.CANCELLED) return serializeDispatch(dispatch);

    // Silinen defter satırlarının anlık görüntüsü audit'e yazılır (iptal edilen sevkiyatın
    // içeriği kaybolmasın; stok sorguları böylece status filtresi taşımak zorunda kalmaz).
    const snapshot = dispatch.items.map((i) => ({
      receiptId: i.receiptId,
      receiptLineId: i.receiptLineId,
      packageId: i.packageId,
      qty: i.qty,
      unit: i.unit,
      description: i.description,
      weightKg: i.weightKg === null ? null : Number(i.weightKg),
    }));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Defteri boşalt: sayaçlar düşer, paletler depoya döner
      await this.unloadItems(dispatch.items, tx);
      // DORMANT kabul-düzeyi bağı (eski kayıtlar) da temizlensin
      await tx.receipt.updateMany({
        where: { dispatchId: id },
        data: { dispatchId: null, dispatchedAt: null, stopId: null },
      });
      return tx.dispatch.update({
        where: { id },
        data: { status: DispatchStatus.CANCELLED },
        include: DISPATCH_INCLUDE,
      });
    });
    await this.audit('dispatch.cancelled', id, userId, { items: snapshot });
    return serializeDispatch(updated);
  }

  // ---- Duraklar (çok noktalı teslimat) ----

  /** Durak ekle. Kayıtlı lokasyon seçildiyse ad/adres/telefon oradan snapshot'lanır. */
  async addStop(id: string, input: CreateDispatchStopInput, userId: string) {
    const dispatch = await this.getOrThrow(id);
    const data = await this.resolveStopData(input);
    const seq = dispatch.stops.reduce((m, s) => Math.max(m, s.seq), 0) + 1;
    await this.prisma.dispatchStop.create({ data: { dispatchId: id, seq, ...data } });
    await this.audit('dispatch.stopAdded', id, userId, { name: data.name });
    return this.findOne(id);
  }

  async updateStop(id: string, stopId: string, input: UpdateDispatchStopInput, userId: string) {
    await this.getStopOrThrow(id, stopId);
    const data = await this.resolveStopData(input);
    await this.prisma.dispatchStop.update({ where: { id: stopId }, data });
    await this.audit('dispatch.stopUpdated', id, userId, { stopId });
    return this.findOne(id);
  }

  /** Durağı sil — bağlı palet/kabullerin ataması düşer (yük sevkiyatta kalır). */
  async removeStop(id: string, stopId: string, userId: string) {
    await this.getStopOrThrow(id, stopId);
    await this.prisma.$transaction(async (tx) => {
      await tx.package.updateMany({ where: { stopId }, data: { stopId: null } });
      await tx.receipt.updateMany({ where: { stopId }, data: { stopId: null } });
      await tx.dispatchStop.delete({ where: { id: stopId } });
    });
    await this.audit('dispatch.stopRemoved', id, userId, { stopId });
    return this.findOne(id);
  }

  /** Rota sırasını değiştir — verilen id sırası seq olur. */
  async reorderStops(id: string, stopIds: string[], userId: string) {
    const dispatch = await this.getOrThrow(id);
    const own = new Set(dispatch.stops.map((s) => s.id));
    if (stopIds.length !== own.size || stopIds.some((sid) => !own.has(sid))) {
      throw new BadRequestException('Durak listesi bu sevkiyatla eşleşmiyor');
    }
    await this.prisma.$transaction(
      stopIds.map((sid, i) =>
        this.prisma.dispatchStop.update({ where: { id: sid }, data: { seq: i + 1 } }),
      ),
    );
    await this.audit('dispatch.stopsReordered', id, userId);
    return this.findOne(id);
  }

  /**
   * Sevkiyattaki kabullerin ön ihbar alıcılarından durakları otomatik türetir ve
   * palet/kabulleri o duraklara atar. Zaten var olan duraklar korunur (ada göre eşleşir).
   */
  async suggestStops(id: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    // Sevkiyattaki tüm kabuller — defterden (kap + kalem satırları birlikte)
    const receiptIds = [...new Set(dispatch.items.map((i) => i.receiptId))];
    if (receiptIds.length === 0) throw new BadRequestException('Sevkiyatta yük yok');

    const receipts = await this.prisma.receipt.findMany({
      where: { id: { in: receiptIds } },
      select: {
        id: true,
        shipment: {
          select: {
            recipientCustomerId: true,
            recipientCustomer: { select: { id: true, name: true, address: true, phone: true } },
            recipients: { select: { customerLocationId: true, label: true, address: true } },
          },
        },
      },
    });

    // Durak anahtarı: lokasyon id'si varsa o, yoksa görünen ad
    const byKey = new Map<string, { name: string; address: string | null; phone: string | null; customerId: string | null; customerLocationId: string | null; receiptIds: string[] }>();
    for (const r of receipts) {
      const sh = r.shipment;
      if (!sh) continue;
      const points = sh.recipients.length
        ? sh.recipients.map((p) => ({
            key: p.customerLocationId ?? p.label,
            name: p.label,
            address: p.address ?? sh.recipientCustomer?.address ?? null,
            customerLocationId: p.customerLocationId,
          }))
        : sh.recipientCustomer
          ? [
              {
                key: sh.recipientCustomer.id,
                name: sh.recipientCustomer.name,
                address: sh.recipientCustomer.address,
                customerLocationId: null,
              },
            ]
          : [];
      for (const pt of points) {
        const cur = byKey.get(pt.key) ?? {
          name: pt.name,
          address: pt.address,
          phone: sh.recipientCustomer?.phone ?? null,
          customerId: sh.recipientCustomerId ?? null,
          customerLocationId: pt.customerLocationId,
          receiptIds: [],
        };
        // Aynı kabul aynı durağa iki kez yazılmasın
        if (!cur.receiptIds.includes(r.id)) cur.receiptIds.push(r.id);
        byKey.set(pt.key, cur);
      }
    }
    if (byKey.size === 0) {
      throw new BadRequestException('Kabullerde alıcı bilgisi yok — durakları elle ekleyin');
    }

    let seq = dispatch.stops.reduce((m, s) => Math.max(m, s.seq), 0);
    await this.prisma.$transaction(async (tx) => {
      for (const cand of byKey.values()) {
        // Var olan durağı ada göre yeniden kullan, yoksa oluştur
        const existing = dispatch.stops.find((s) => s.name === cand.name);
        const stopId =
          existing?.id ??
          (
            await tx.dispatchStop.create({
              data: {
                dispatchId: id,
                seq: ++seq,
                customerId: cand.customerId,
                customerLocationId: cand.customerLocationId,
                name: cand.name,
                address: cand.address,
                phone: cand.phone,
              },
            })
          ).id;
        // Yalnızca henüz atanmamış yükleri bağla (elle yapılan atamayı ezme)
        await tx.dispatchItem.updateMany({
          where: { dispatchId: id, stopId: null, receiptId: { in: cand.receiptIds } },
          data: { stopId },
        });
        // Ayna: palet stopId'si
        await tx.package.updateMany({
          where: { dispatchId: id, stopId: null, receiptId: { in: cand.receiptIds } },
          data: { stopId },
        });
      }
    });
    await this.audit('dispatch.stopsSuggested', id, userId, { count: byKey.size });
    return this.findOne(id);
  }

  /** Yükleri bir durağa ata (stopId null → atamayı kaldır).
   *  `itemIds` yeni yol; `packageIds`/`receiptIds` geriye uyum için defter satırına çevrilir. */
  async assignToStop(id: string, stopId: string | null, input: AssignToStopInput, userId: string) {
    const dispatch = await this.getOrThrow(id);
    if (stopId) await this.getStopOrThrow(id, stopId);

    const own = new Set(dispatch.items.map((i) => i.id));
    const itemIds = new Set((input.itemIds ?? []).filter((i) => own.has(i)));
    // Geriye uyum: palet/kabul id'leri → defter satırı
    for (const pid of input.packageIds ?? []) {
      const it = dispatch.items.find((i) => i.packageId === pid);
      if (it) itemIds.add(it.id);
    }
    for (const rid of input.receiptIds ?? []) {
      dispatch.items.filter((i) => i.receiptId === rid).forEach((i) => itemIds.add(i.id));
    }
    if (itemIds.size === 0) throw new BadRequestException('Seçilen yük bu sevkiyatta değil');

    const ids = [...itemIds];
    await this.prisma.$transaction(async (tx) => {
      await tx.dispatchItem.updateMany({ where: { id: { in: ids } }, data: { stopId } });
      // Ayna: palet satırlarının stopId'si (eski okuma yolları için)
      const pkgIds = dispatch.items.filter((i) => ids.includes(i.id) && i.packageId).map((i) => i.packageId!);
      if (pkgIds.length) {
        await tx.package.updateMany({ where: { id: { in: pkgIds } }, data: { stopId } });
      }
    });
    await this.audit('dispatch.stopAssigned', id, userId, { stopId, itemIds: ids });
    return this.findOne(id);
  }

  /** Durağı teslim edildi / edilmedi olarak işaretle (sevk sonrası da serbest). */
  async setStopDelivered(id: string, stopId: string, delivered: boolean, userId: string) {
    await this.getStopOrThrow(id, stopId);
    await this.prisma.dispatchStop.update({
      where: { id: stopId },
      data: { deliveredAt: delivered ? new Date() : null },
    });
    await this.audit(delivered ? 'dispatch.stopDelivered' : 'dispatch.stopUndelivered', id, userId, {
      stopId,
    });
    return this.findOne(id);
  }

  // ---- Taşıma irsaliyesi ----

  /**
   * Matbu taşıma irsaliyesinin seri/sıra no'su + taşıma ücreti.
   * Yasal numarayı anlaşmalı matbaa basar; burada yalnızca kâğıtla dijital kaydı eşleriz.
   */
  async updateWaybill(id: string, input: UpdateWaybillInput, userId: string) {
    const dispatch = await this.getOrThrow(id);
    if (dispatch.status === DispatchStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş sevkiyata irsaliye bilgisi girilemez');
    }
    const blank = (v?: string) => (v?.trim() ? v.trim() : null);
    try {
      const updated = await this.prisma.dispatch.update({
        where: { id },
        data: {
          // GİDECEĞİ YER belgeye basılır; boşa çekilemez (kolon NOT NULL)
          destination: input.destination?.trim() ? input.destination.trim() : undefined,
          waybillSerial: input.waybillSerial === undefined ? undefined : blank(input.waybillSerial),
          waybillNo: input.waybillNo === undefined ? undefined : blank(input.waybillNo),
          waybillDate:
            input.waybillDate === undefined
              ? undefined
              : input.waybillDate
                ? new Date(input.waybillDate)
                : null,
          freightAmount: input.freightAmount === undefined ? undefined : (input.freightAmount ?? null),
          freightVatIncluded: input.freightVatIncluded,
        },
        include: DISPATCH_INCLUDE,
      });
      await this.audit('dispatch.waybillUpdated', id, userId);
      return serializeDispatch(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Bu irsaliye seri/sıra numarası zaten kayıtlı');
      }
      throw err;
    }
  }

  // ---- Yük defteri (tek yazma hunisi) ----

  /**
   * Sevkiyata yük ekler — TÜM yükleme yolları buradan geçer (palet QR, toplu, kalem, hızlı sevk).
   * Defter (DispatchItem) ve ayna (Package.dispatchId) HER ZAMAN aynı transaction'da yazılır.
   *
   * Tek-granülerlik kuralı: bir kabulün paleti varsa KAP bazlı, yoksa KALEM bazlı sevk edilir.
   * Karışık kullanım çift sayıma yol açacağı için reddedilir.
   */
  private async loadItems(
    dispatchId: string,
    entries: LoadEntry[],
    tx: Prisma.TransactionClient,
    opts: { dispatchedAt?: Date } = {},
  ): Promise<number> {
    let count = 0;
    for (const e of entries) {
      if (e.packageId) {
        const pkg = await tx.package.findUnique({
          where: { id: e.packageId },
          include: {
            receipt: {
              select: {
                id: true,
                status: true,
                lines: { select: { description: true, weightKg: true } },
                _count: { select: { packages: true } },
              },
            },
          },
        });
        if (!pkg) throw new NotFoundException('Palet bulunamadı');
        if (pkg.receipt.status !== ReceiptStatus.COMPLETED) {
          throw new BadRequestException('Bu paletin mal kabulü henüz tamamlanmadı');
        }
        if (pkg.dispatchId && pkg.dispatchId !== dispatchId) {
          throw new BadRequestException('Bu palet başka bir sevkiyatta');
        }
        const already = await tx.dispatchItem.findUnique({ where: { packageId: pkg.id } });
        if (already) continue; // idempotent
        await tx.dispatchItem.create({
          data: {
            dispatchId,
            stopId: e.stopId ?? pkg.stopId ?? null,
            receiptId: pkg.receiptId,
            packageId: pkg.id,
            qty: 1,
            unit: pkg.type,
            description: describeLines(pkg.receipt.lines),
            // Palet kaleme bağlı değil → kabulün toplam kilosu paletlere eşit paylaştırılır
            weightKg: perPackageWeight(pkg.receipt.lines, pkg.receipt._count.packages),
          },
        });
        // Ayna
        await tx.package.update({
          where: { id: pkg.id },
          data: { dispatchId, ...(opts.dispatchedAt ? { dispatchedAt: opts.dispatchedAt } : {}) },
        });
        count++;
        continue;
      }

      // --- Kalem satırı ---
      const line = await tx.receiptLine.findUnique({
        where: { id: e.receiptLineId! },
        include: { receipt: { select: { id: true, status: true, _count: { select: { packages: true } } } } },
      });
      if (!line) throw new NotFoundException('Kabul kalemi bulunamadı');
      if (line.receipt.status !== ReceiptStatus.COMPLETED) {
        throw new BadRequestException('Bu kalemin mal kabulü henüz tamamlanmadı');
      }
      if (line.receipt._count.packages > 0) {
        throw new BadRequestException(
          'Bu mal kabul palet (QR) bazlı takip ediliyor — kalem yerine palet seçin',
        );
      }
      const qty = Math.trunc(e.qty ?? 0);
      const remaining = line.countedQty - line.dispatchedQty;
      if (qty <= 0) throw new BadRequestException('Miktar 0’dan büyük olmalı');
      if (qty > remaining) {
        throw new BadRequestException(
          `"${line.description}" için depoda ${remaining} ${line.unit} kaldı (${qty} istendi)`,
        );
      }
      // İyimser kilit: iki operatör aynı kalemi aynı anda yüklerse ikincisi hata alır
      const locked = await tx.receiptLine.updateMany({
        where: { id: line.id, dispatchedQty: line.dispatchedQty },
        data: { dispatchedQty: { increment: qty } },
      });
      if (locked.count === 0) {
        throw new BadRequestException('Bu kalem az önce değişti, listeyi yenileyip tekrar deneyin');
      }
      await tx.dispatchItem.create({
        data: {
          dispatchId,
          stopId: e.stopId ?? null,
          receiptId: line.receiptId,
          receiptLineId: line.id,
          qty,
          unit: line.unit,
          description: line.description,
          // Kısmi sevkte kilo da oransal: 100 adet / 500 kg kalemden 40 adet → 200 kg
          weightKg: portionWeight(line.weightKg, qty, line.countedQty),
        },
      });
      count++;
    }
    return count;
  }

  /** Yükü sevkiyattan çıkarır: defter satırı silinir, sayaç düşülür, ayna temizlenir. */
  private async unloadItems(
    items: { id: string; receiptLineId: string | null; packageId: string | null; qty: number }[],
    tx: Prisma.TransactionClient,
  ) {
    for (const it of items) {
      if (it.receiptLineId) {
        await tx.receiptLine.update({
          where: { id: it.receiptLineId },
          data: { dispatchedQty: { decrement: it.qty } },
        });
      }
      if (it.packageId) {
        await tx.package.update({
          where: { id: it.packageId },
          data: { dispatchId: null, dispatchedAt: null, stopId: null },
        });
      }
      await tx.dispatchItem.delete({ where: { id: it.id } });
    }
  }

  // ---- helpers ----

  private async getStopOrThrow(dispatchId: string, stopId: string) {
    const stop = await this.prisma.dispatchStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.dispatchId !== dispatchId) throw new NotFoundException('Durak bulunamadı');
    return stop;
  }

  /** Lokasyon seçildiyse ad/adres/telefonu kayıttan snapshot'la (ASN validateRecipients deseni). */
  private async resolveStopData(input: CreateDispatchStopInput) {
    if (input.customerLocationId) {
      const loc = await this.prisma.customerLocation.findUnique({
        where: { id: input.customerLocationId },
      });
      if (!loc) throw new BadRequestException('Geçersiz lokasyon seçimi');
      if (input.customerId && loc.customerId !== input.customerId) {
        throw new BadRequestException('Lokasyon seçilen müşteriye ait değil');
      }
      return {
        customerId: input.customerId ?? loc.customerId,
        customerLocationId: loc.id,
        name: loc.name,
        address: loc.address,
        phone: loc.phone,
        note: input.note ?? null,
      };
    }
    if (input.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new BadRequestException('Geçersiz müşteri seçimi');
      return {
        customerId: customer.id,
        customerLocationId: null,
        name: input.name?.trim() || customer.name,
        address: input.address ?? customer.address,
        phone: input.phone ?? customer.phone,
        note: input.note ?? null,
      };
    }
    return {
      customerId: null,
      customerLocationId: null,
      name: input.name!.trim(),
      address: input.address ?? null,
      phone: input.phone ?? null,
      note: input.note ?? null,
    };
  }

  private async getOrThrow(id: string): Promise<DispatchWithRelations> {
    const dispatch = await this.prisma.dispatch.findUnique({ where: { id }, include: DISPATCH_INCLUDE });
    if (!dispatch) throw new NotFoundException('Sevkiyat bulunamadı');
    return dispatch;
  }

  private ensureDraft(dispatch: DispatchWithRelations) {
    if (dispatch.status !== DispatchStatus.DRAFT) {
      throw new BadRequestException('Bu sevkiyat artık düzenlenemez');
    }
  }

  private audit(action: string, entityId: string, userId: string, metadata?: Prisma.InputJsonValue) {
    return this.prisma.auditEvent.create({
      data: { action, entityType: 'Dispatch', entityId, userId, metadata },
    });
  }
}

function serializeDispatch(d: DispatchWithRelations) {
  return {
    id: d.id,
    reference: d.reference,
    status: d.status,
    destination: d.destination,
    vehiclePlate: d.vehiclePlate,
    driverName: d.driverName,
    vehicleId: d.vehicleId,
    vehicle: d.vehicle,
    notes: d.notes,
    dispatchedAt: d.dispatchedAt,
    createdAt: d.createdAt,
    // Taşıma irsaliyesi (matbu belge bilgileri + ücret)
    waybillSerial: d.waybillSerial,
    waybillNo: d.waybillNo,
    waybillDate: d.waybillDate,
    freightAmount: d.freightAmount == null ? null : Number(d.freightAmount),
    freightVatIncluded: d.freightVatIncluded,
    packages: d.packages.map((p) => ({
      id: p.id,
      code: p.code,
      type: p.type,
      customerName: p.receipt.customer?.name ?? null, // GÖNDERİCİ
      receiptReference: p.receipt.reference,
      receiptId: p.receiptId,
      waybillNo: p.receipt.waybillNo,
      plannedVehicle: p.receipt.shipment?.vehicle ?? null,
      warehouseName: p.receipt.warehouse?.name ?? null, // NEREDEN
      recipientName: recipientNameOf(p.receipt.shipment), // KİME (ön ihbardaki alıcı)
      goodsKind: goodsKindOf(p.receipt.lines), // MALIN CİNSİ
      stopId: p.stopId,
    })),
    receipts: d.receipts.map((r) => ({
      id: r.id,
      reference: r.reference,
      customerName: r.customer?.name ?? null,
      itemCount: r.lines.reduce((s, l) => s + l.countedQty, 0),
      warehouseName: r.warehouse?.name ?? null,
      recipientName: r.shipment?.recipientCustomer?.name ?? null,
      goodsKind: goodsKindOf(r.lines),
      stopId: r.stopId,
    })),
    // Sevkiyattaki yükün TEK kaynağı — belgeler ve UI bunu kullanır
    items: d.items.map((i) => ({
      id: i.id,
      kind: i.packageId ? ('PACKAGE' as const) : ('LINE' as const),
      qty: i.qty,
      unit: i.unit,
      description: i.description, // MALIN CİNSİ (snapshot)
      weightKg: i.weightKg === null ? null : Number(i.weightKg), // KİLO (snapshot)
      stopId: i.stopId,
      receiptId: i.receiptId,
      receiptReference: i.receipt.reference,
      receiptLineId: i.receiptLineId,
      packageId: i.packageId,
      packageCode: i.package?.code ?? null,
      customerName: i.receipt.customer?.name ?? null, // GÖNDERİCİ
      warehouseName: i.receipt.warehouse?.name ?? null, // NEREDEN
      recipientName: recipientNameOf(i.receipt.shipment), // ön ihbardaki alıcı
      waybillNo: i.receipt.waybillNo, // müşterinin SEVK İRSALİYE no'su
      plannedVehicle: i.receipt.shipment?.vehicle ?? null,
    })),
    stops: d.stops.map((s) => ({
      id: s.id,
      seq: s.seq,
      customerId: s.customerId,
      customerName: s.customer?.name ?? null, // ALICI firma (belgede bu yazılır)
      customerLocationId: s.customerLocationId,
      name: s.name, // boşaltma noktası adı (ekranda gösterilir)
      address: s.address,
      phone: s.phone,
      note: s.note,
      deliveredAt: s.deliveredAt,
      // Durak kartındaki sayılar artık defterden
      packageCount: d.items.filter((i) => i.stopId === s.id && i.packageId).length,
      receiptCount: new Set(
        d.items.filter((i) => i.stopId === s.id && i.receiptLineId).map((i) => i.receiptId),
      ).size,
      itemCount: s._count.items,
    })),
  };
}

/** İrsaliyedeki "MALIN CİNSİ": tek kalemse açıklaması, çok kalemse "Muhtelif". */
function goodsKindOf(lines: { description: string }[]): string {
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0].description;
  return 'Muhtelif';
}

/** Ön ihbardaki alıcı adı: kayıtlı alıcı müşteri, yoksa ilk boşaltma noktasının etiketi. */
function recipientNameOf(
  shipment: { recipientCustomer: { name: string } | null; recipients: { label: string }[] } | null,
): string | null {
  if (!shipment) return null;
  return shipment.recipientCustomer?.name ?? shipment.recipients[0]?.label ?? null;
}
