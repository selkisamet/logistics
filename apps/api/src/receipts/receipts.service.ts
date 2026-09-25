import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import { datedReference, randomCode } from '../common/codes';
import { attachmentUrl } from '../common/upload';
import {
  PACKAGE_TYPE_LABELS,
  PackageType,
  ReceiptStatus,
  ShipmentStatus,
  trUpper,
  type CreatePackageInput,
  type ReceiptListQuery,
  type ReceiptRecipientInput,
  type ReceiptSourceInput,
  type StartReceiptInput,
  type UpdateReceiptCommercialInput,
  type UpsertReceiptLineInput,
} from '@lojistik/shared';

const RECEIPT_INCLUDE = {
  customer: {
    select: {
      id: true,
      name: true,
      legalName: true, // belgelerde basılan tam ünvan
      code: true,
      address: true,
      phone: true,
      taxOffice: true,
      taxNumber: true,
    },
  },
  warehouse: { select: { id: true, name: true, code: true } },
  // Ticari/taraf bilgileri artık MAL KABULÜN kendisinde (akış ön ihbardan buraya taşındı).
  // `shipment` yalnız eski kayıtların referansını göstermek için duruyor.
  shipment: { select: { reference: true } },
  plannedVehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
  recipientCustomer: {
    select: {
      id: true,
      name: true,
      legalName: true, // belgelerde basılan tam ünvan
      code: true,
      address: true,
      phone: true,
      taxOffice: true,
      taxNumber: true,
    },
  },
  sources: {
    select: { id: true, customerLocationId: true, warehouseId: true, label: true, address: true },
  },
  recipients: { select: { id: true, customerLocationId: true, label: true, address: true } },
  lines: { orderBy: { createdAt: 'asc' } as const },
  packages: { orderBy: { createdAt: 'desc' } as const },
  discrepancies: {
    orderBy: { createdAt: 'desc' } as const,
    include: { attachments: { orderBy: { createdAt: 'asc' } as const } },
  },
  attachments: { orderBy: { createdAt: 'asc' } as const },
} satisfies Prisma.ReceiptInclude;

type ReceiptWithRelations = Prisma.ReceiptGetPayload<{ include: typeof RECEIPT_INCLUDE }>;

@Injectable()
export class ReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ReceiptListQuery) {
    const { page, pageSize, search, status } = query;
    const where: Prisma.ReceiptWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
        include: RECEIPT_INCLUDE,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.receipt.count({ where }),
    ]);
    return paginate(items.map(serializeReceipt), total, page, pageSize);
  }

  /** Depodaki ürünler: tamamlanmış ama henüz sevk edilmemiş kabuller. */
  async findStock(query: ReceiptListQuery) {
    const { page, pageSize, search } = query;
    const where: Prisma.ReceiptWhereInput = {
      status: ReceiptStatus.COMPLETED,
      // AND: iki koşul birden — (1) depoda kalan, (2) arama. (OR'lar ayrı tutulur, çakışmaz.)
      AND: [
        {
          // Depoda kalan (tek-granülerlik kuralı):
          //  (a) KAP bazlı  — sevk edilmemiş paleti olan
          //  (b) KALEM bazlı — hiç paleti olmayıp sevk edilmemiş miktarı kalan kalemi olan
          //     (kısmi sevkte kabul depoda kalmaya devam eder; Prisma alan-referansı ile)
          OR: [
            { packages: { some: { dispatchedAt: null, dispatchId: null } } },
            {
              AND: [
                { packages: { none: {} } },
                {
                  lines: {
                    some: { dispatchedQty: { lt: this.prisma.receiptLine.fields.countedQty } },
                  },
                },
              ],
            },
          ],
        },
        ...(search
          ? [
              {
                OR: [
                  { reference: { contains: search, mode: 'insensitive' as const } },
                  { waybillNo: { contains: search, mode: 'insensitive' as const } },
                  { customer: { name: { contains: search, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
        include: RECEIPT_INCLUDE,
        // Önce TERMİNİ yakın olan (Postgres ASC'te NULL'lar sona düşer → terminsizler altta),
        // termin eşitse/yoksa en uzun bekleyen üstte.
        orderBy: [{ deliveryBy: 'asc' }, { completedAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.receipt.count({ where }),
    ]);
    return paginate(items.map(serializeReceipt), total, page, pageSize);
  }

  async findOne(id: string) {
    return serializeReceipt(await this.getOrThrow(id));
  }

  /**
   * Mal kabul başlatma — uygulamanın GİRİŞ NOKTASI.
   *
   * Araç depoya gelir, irsaliyesini getirir, depocu kontrol edip malı indirir.
   * Ön ihbar YOK: malın geleceği çoğu zaman önceden bilinmiyor. ALICI opsiyonel,
   * çünkü gelen irsaliyede nihai firma her zaman yazmıyor — ofis sonradan
   * `updateCommercial` ile tamamlar. Yükleme yeri de orada girilir: depocu
   * malın nereden yüklendiğini bilmez.
   *
   * Gelen kap ve tutanak kayıtla AYNI transaction'da oluşur. Tarayıcıdan arka
   * arkaya istek zincirlemek yarım kalmış kayıt üretebiliyordu (kayıt açılır,
   * kalem eklenmez); burada ya hepsi olur ya hiçbiri.
   */
  async start(input: StartReceiptInput, userId: string) {
    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: input.customerId } }),
      this.prisma.warehouse.findUnique({ where: { id: input.warehouseId } }),
    ]);
    if (!customer) throw new BadRequestException('Geçersiz gönderici');
    if (!warehouse) throw new BadRequestException('Geçersiz depo');

    const recipientId = await this.validateRecipientCustomer(input.recipientCustomerId);
    const kap = input.kap;

    // QR istendiyse kap bazlı (her kap için etiket), istenmediyse kalem bazlı
    // (satır başına bir kalem). Tek-granülerlik kuralı: ikisi bir arada çift
    // sayım yapardı, bu yüzden karar satır başına değil KAYIT başınadır.
    const packages: Prisma.PackageCreateWithoutReceiptInput[] | undefined =
      kap && kap.makeLabels
        ? kap.items.flatMap((it) =>
            Array.from({ length: it.count }, () => ({
              code: `PKG-${randomCode(8)}`,
              type: packageTypeOf(it.type),
              note: it.description ?? null,
            })),
          )
        : undefined;
    const lines: Prisma.ReceiptLineCreateWithoutReceiptInput[] | undefined =
      kap && !kap.makeLabels
        ? kap.items.map((it) => ({
            sku: '',
            description: it.description || trUpper(it.type),
            countedQty: it.count,
            unit: it.type,
            expectedQty: null,
          }))
        : undefined;

    const receipt = await this.createWithUniqueRef((reference) =>
      this.prisma.receipt.create({
        data: {
          reference,
          status: ReceiptStatus.IN_PROGRESS,
          customerId: customer.id,
          warehouseId: warehouse.id,
          recipientCustomerId: recipientId,
          waybillNo: input.waybillNo,
          notes: input.notes,
          startedById: userId,
          lines: lines ? { create: lines } : undefined,
          packages: packages ? { create: packages } : undefined,
          discrepancies: input.discrepancy
            ? {
                create: {
                  type: input.discrepancy.type,
                  description: input.discrepancy.description,
                  createdById: userId,
                },
              }
            : undefined,
        },
        include: RECEIPT_INCLUDE,
      }),
    );
    await this.audit('receipt.started', 'Receipt', receipt.id, userId, {
      kap: kap
        ? `${kap.items.map((it) => `${it.count} ${it.type}`).join(', ')}${
            kap.makeLabels ? ' (QR)' : ''
          }`
        : null,
    });
    return serializeReceipt(receipt);
  }

  /**
   * Ticari/taraf bilgileri — OFİS doldurur (yönetici/şef).
   * Yalnız gönderilen alanlar değişir; `undefined` = dokunma, `null` = temizle.
   */
  async updateCommercial(id: string, input: UpdateReceiptCommercialInput, userId: string) {
    const receipt = await this.getOrThrow(id);

    const recipientId =
      input.recipientCustomerId === undefined
        ? undefined
        : await this.validateRecipientCustomer(input.recipientCustomerId ?? undefined);

    const sources =
      input.sources === undefined
        ? undefined
        : await this.validateSources(receipt.customerId, input.sources);
    const recipients =
      input.recipients === undefined
        ? undefined
        : await this.validateRecipients(
            input.recipientCustomerId === undefined
              ? receipt.recipientCustomerId
              : (input.recipientCustomerId ?? null),
            input.recipients,
          );

    await this.prisma.$transaction(async (tx) => {
      await tx.receipt.update({
        where: { id },
        data: {
          recipientCustomerId: recipientId === undefined ? undefined : recipientId,
          plannedVehicleId:
            input.plannedVehicleId === undefined ? undefined : (input.plannedVehicleId ?? null),
          deliveryBy:
            input.deliveryBy === undefined
              ? undefined
              : input.deliveryBy
                ? new Date(input.deliveryBy)
                : null,
          currency: input.currency,
          paymentType: input.paymentType === undefined ? undefined : (input.paymentType ?? null),
          showAmountOnSlip: input.showAmountOnSlip,
          vatIncluded: input.vatIncluded,
        },
      });
      // Nokta listeleri verildiyse TAMAMI değişir (ön ihbardaki desenin aynısı)
      if (sources) {
        await tx.receiptSource.deleteMany({ where: { receiptId: id } });
        await tx.receiptSource.createMany({ data: sources.map((s) => ({ ...s, receiptId: id })) });
      }
      if (recipients) {
        await tx.receiptRecipient.deleteMany({ where: { receiptId: id } });
        await tx.receiptRecipient.createMany({
          data: recipients.map((r) => ({ ...r, receiptId: id })),
        });
      }
    });

    await this.audit('receipt.commercial_updated', 'Receipt', id, userId, {});
    return this.findOne(id);
  }

  /** Alıcı = kayıtlı Müşteri. Boş geçilebilir (depocu bilmeyebilir). */
  private async validateRecipientCustomer(id?: string): Promise<string | null> {
    if (!id) return null;
    const found = await this.prisma.customer.findUnique({ where: { id } });
    if (!found) throw new BadRequestException('Geçersiz alıcı seçimi');
    return found.id;
  }

  /**
   * Yükleme yerlerini doğrular; kayıtlı bir yer seçildiyse etiket+adres o kayıttan
   * sabitlenir (kayıt sonradan değişse de belge sabit kalsın). Yükleme yeri
   * göndericinin deposu olabileceği gibi BİZİM depomuz da olabilir.
   */
  private async validateSources(customerId: string, sources: ReceiptSourceInput[] | undefined) {
    if (!sources || sources.length === 0) return [];

    const locIds = sources.map((s) => s.customerLocationId).filter((x): x is string => !!x);
    const locations = locIds.length
      ? await this.prisma.customerLocation.findMany({ where: { id: { in: locIds }, customerId } })
      : [];
    const byId = new Map(locations.map((l) => [l.id, l]));

    const whIds = sources.map((s) => s.warehouseId).filter((x): x is string => !!x);
    const warehouses = whIds.length
      ? await this.prisma.warehouse.findMany({ where: { id: { in: whIds } } })
      : [];
    const whById = new Map(warehouses.map((w) => [w.id, w]));

    return sources.map((s) => {
      if (s.customerLocationId) {
        const loc = byId.get(s.customerLocationId);
        if (!loc) throw new BadRequestException('Geçersiz yükleme yeri seçimi');
        return {
          customerLocationId: loc.id,
          warehouseId: null,
          label: loc.name,
          address: loc.address,
        };
      }
      if (s.warehouseId) {
        const wh = whById.get(s.warehouseId);
        if (!wh) throw new BadRequestException('Geçersiz depo seçimi');
        return { customerLocationId: null, warehouseId: wh.id, label: wh.name, address: wh.address };
      }
      return { customerLocationId: null, warehouseId: null, label: s.label, address: null };
    });
  }

  /** Boşaltma yerleri — alıcı müşterinin lokasyonları ya da serbest metin. */
  private async validateRecipients(
    recipientCustomerId: string | null,
    recipients: ReceiptRecipientInput[] | undefined,
  ) {
    if (!recipients || recipients.length === 0) return [];

    const ids = recipients.map((r) => r.customerLocationId).filter((x): x is string => !!x);
    const locations =
      ids.length && recipientCustomerId
        ? await this.prisma.customerLocation.findMany({
            where: { id: { in: ids }, customerId: recipientCustomerId },
          })
        : [];
    const byId = new Map(locations.map((l) => [l.id, l]));

    return recipients.map((r) => {
      if (r.customerLocationId) {
        const loc = byId.get(r.customerLocationId);
        if (!loc) throw new BadRequestException('Geçersiz boşaltma yeri seçimi');
        return { customerLocationId: loc.id, label: loc.name, address: loc.address };
      }
      return { customerLocationId: null, label: r.label, address: null };
    });
  }

  async update(id: string, input: { waybillNo?: string; orderNo?: string; notes?: string }) {
    await this.getOrThrow(id);
    await this.prisma.receipt.update({
      where: { id },
      data: { waybillNo: input.waybillNo, orderNo: input.orderNo, notes: input.notes },
    });
    return this.findOne(id);
  }

  async upsertLine(id: string, input: UpsertReceiptLineInput) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);

    // Önce satır id'siyle (en güvenilir), yoksa dolu bir SKU ile eşleştir.
    const existing = input.lineId
      ? receipt.lines.find((l) => l.id === input.lineId)
      : input.sku
        ? receipt.lines.find((l) => l.sku && l.sku.toLowerCase() === input.sku!.toLowerCase())
        : undefined;
    if (existing) {
      await this.prisma.receiptLine.update({
        where: { id: existing.id },
        data: {
          countedQty: input.countedQty,
          description: input.description,
          unit: input.unit,
          barcode: input.barcode ?? existing.barcode,
          // kg/fiyat gönderilmediyse mevcut değeri koru (sayım butonları bunları taşımıyor)
          weightKg: input.weightKg === undefined ? undefined : input.weightKg,
          unitPrice: input.unitPrice === undefined ? undefined : input.unitPrice,
        },
      });
    } else {
      await this.prisma.receiptLine.create({
        data: {
          receiptId: id,
          sku: input.sku ?? '',
          description: input.description,
          countedQty: input.countedQty,
          unit: input.unit,
          barcode: input.barcode,
          weightKg: input.weightKg ?? null,
          unitPrice: input.unitPrice ?? null,
          shipmentLineId: input.asnLineId,
          expectedQty: null, // ön ihbarda olmayan ekstra kalem
        },
      });
    }
    return this.findOne(id);
  }

  async removeLine(id: string, lineId: string) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);
    await this.prisma.receiptLine.deleteMany({ where: { id: lineId, receiptId: id } });
    return this.findOne(id);
  }

  async createPackage(id: string, input: CreatePackageInput) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);

    const created = [];
    for (let n = 0; n < input.count; n++) {
      created.push(await this.createOnePackage(id, input));
    }
    return created;
  }

  private async createOnePackage(receiptId: string, input: CreatePackageInput) {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.package.create({
          data: {
            code: `PKG-${randomCode(8)}`,
            type: input.type,
            sku: input.sku,
            qty: input.qty,
            note: input.note,
            receiptId,
          },
        });
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

  async complete(id: string, userId: string) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.COMPLETED, completedAt: new Date() },
        include: RECEIPT_INCLUDE,
      });
      if (receipt.shipmentId) {
        await tx.inboundShipment.update({
          where: { id: receipt.shipmentId },
          data: { status: ShipmentStatus.COMPLETED },
        });
      }
      return r;
    });

    await this.audit('receipt.completed', 'Receipt', id, userId, {
      lineCount: updated.lines.length,
      totalCounted: updated.lines.reduce((s, l) => s + l.countedQty, 0),
    });
    return serializeReceipt(updated);
  }

  async cancel(id: string, userId: string) {
    const receipt = await this.getOrThrow(id);
    if (receipt.status === ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Tamamlanmış kabul iptal edilemez');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.CANCELLED },
        include: RECEIPT_INCLUDE,
      });
      // ASN'yi tekrar beklenen duruma al
      if (receipt.shipmentId) {
        await tx.inboundShipment.update({
          where: { id: receipt.shipmentId },
          data: { status: ShipmentStatus.EXPECTED },
        });
      }
      return r;
    });
    await this.audit('receipt.cancelled', 'Receipt', id, userId);
    return serializeReceipt(updated);
  }

  /** Tamamlanmış (sevk edilmemiş) mal kabulü tekrar düzenlemeye açar. */
  async reopen(id: string, userId: string) {
    const receipt = await this.getOrThrow(id);
    if (receipt.status !== ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Yalnızca tamamlanmış mal kabul geri açılabilir');
    }
    // Sevk defterinde satırı varsa geri açılamaz — aksi halde countedQty düşürülüp
    // dispatchedQty sayacı bozulabilir (kalan negatife düşer).
    const loaded = await this.prisma.dispatchItem.count({ where: { receiptId: id } });
    const dispatched =
      loaded > 0 || !!receipt.dispatchId || receipt.packages.some((p) => p.dispatchId || p.dispatchedAt);
    if (dispatched) {
      throw new BadRequestException('Sevk edilmiş mal kabul geri açılamaz');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.receipt.update({
        where: { id },
        data: { status: ReceiptStatus.IN_PROGRESS, completedAt: null },
        include: RECEIPT_INCLUDE,
      });
      // Bağlı ön ihbarı tekrar "mal kabulde" durumuna al
      if (receipt.shipmentId) {
        await tx.inboundShipment.update({
          where: { id: receipt.shipmentId },
          data: { status: ShipmentStatus.IN_RECEIVING },
        });
      }
      return r;
    });
    await this.audit('receipt.reopened', 'Receipt', id, userId);
    return serializeReceipt(updated);
  }

  /** İrsaliye/belge görüntülerini (foto) mal kabule ekler. */
  async addAttachments(id: string, files: Express.Multer.File[]) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);
    if (!files || files.length === 0) throw new BadRequestException('Görsel bulunamadı');
    await this.prisma.attachment.createMany({
      data: files.map((f) => ({
        url: attachmentUrl(f.filename),
        fileName: f.originalname,
        mimeType: f.mimetype,
        receiptId: id,
      })),
    });
    return this.findOne(id);
  }

  /** Mal kabule bağlı bir görüntüyü siler. */
  async removeAttachment(id: string, attachmentId: string) {
    const receipt = await this.getOrThrow(id);
    this.ensureInProgress(receipt);
    await this.prisma.attachment.deleteMany({ where: { id: attachmentId, receiptId: id } });
    return this.findOne(id);
  }

  // ---- helpers ----

  private async getOrThrow(id: string): Promise<ReceiptWithRelations> {
    const receipt = await this.prisma.receipt.findUnique({ where: { id }, include: RECEIPT_INCLUDE });
    if (!receipt) throw new NotFoundException('Mal kabul kaydı bulunamadı');
    return receipt;
  }

  private ensureInProgress(receipt: ReceiptWithRelations) {
    if (receipt.status !== ReceiptStatus.IN_PROGRESS) {
      throw new BadRequestException('Bu mal kabul artık düzenlenemez');
    }
  }

  private async createWithUniqueRef(
    fn: (reference: string) => Promise<ReceiptWithRelations>,
  ): Promise<ReceiptWithRelations> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await fn(datedReference('TES'));
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

  private audit(
    action: string,
    entityType: string,
    entityId: string,
    userId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditEvent.create({
      data: { action, entityType, entityId, userId, metadata },
    });
  }
}

/** Kap ETİKETİNDEN (Palet/Varil…) QR paletinin enum tipini bulur. */
function packageTypeOf(label: string): PackageType {
  const hit = Object.entries(PACKAGE_TYPE_LABELS).find(([, v]) => v === label);
  return (hit?.[0] as PackageType) ?? PackageType.OTHER;
}

/** Nokta listesinin adreslerini tek satıra toplar (fişteki tek satırlık adres alanı için). */
function joinAddresses(arr: { address: string | null }[]): string | null {
  const addrs = arr.map((x) => x.address).filter((a): a is string => !!a);
  return addrs.length ? Array.from(new Set(addrs)).join(' / ') : null;
}

function serializeReceipt(r: ReceiptWithRelations) {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    // DORMANT: ön ihbar akışı kaldırıldı; yeni kabullerde null
    asnId: r.shipmentId,
    asnReference: r.shipment?.reference ?? null,
    plannedVehicleId: r.plannedVehicleId,
    plannedVehicle: r.plannedVehicle,
    customerId: r.customerId,
    customer: r.customer,
    warehouseId: r.warehouseId,
    warehouse: r.warehouse,
    notes: r.notes,
    waybillNo: r.waybillNo,
    orderNo: r.orderNo,
    deliveryBy: r.deliveryBy,
    dispatchId: r.dispatchId,
    dispatchedAt: r.dispatchedAt,
    // Taraf/adres/ödeme bilgileri (fiş için) — ofis doldurur
    loadAddress: joinAddresses(r.sources),
    deliveryAddress: joinAddresses(r.recipients),
    paymentType: r.paymentType as 'SENDER' | 'RECIPIENT' | null,
    showAmountOnSlip: r.showAmountOnSlip,
    vatIncluded: r.vatIncluded,
    currency: r.currency as 'TRY' | 'USD' | 'EUR' | 'GBP',
    recipientCustomerId: r.recipientCustomerId,
    recipientCustomer: r.recipientCustomer,
    sources: r.sources,
    recipients: r.recipients,
    startedById: r.startedById,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    lines: r.lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      expectedQty: l.expectedQty,
      countedQty: l.countedQty,
      unit: l.unit,
      barcode: l.barcode,
      unitPrice: l.unitPrice === null ? null : Number(l.unitPrice),
      weightKg: l.weightKg === null ? null : Number(l.weightKg),
      // Kalem bazlı sevk: ne kadarı araca yüklendi, depoda ne kaldı
      dispatchedQty: l.dispatchedQty,
      remainingQty: Math.max(0, l.countedQty - l.dispatchedQty),
    })),
    packages: r.packages.map((p) => ({
      id: p.id,
      code: p.code,
      type: p.type,
      sku: p.sku,
      qty: p.qty,
      note: p.note,
      receiptId: p.receiptId,
      createdAt: p.createdAt,
      dispatchedAt: p.dispatchedAt,
      dispatchId: p.dispatchId,
    })),
    discrepancies: r.discrepancies.map((d) => ({
      id: d.id,
      receiptId: d.receiptId,
      receiptLineId: d.receiptLineId,
      type: d.type,
      qty: d.qty,
      description: d.description,
      createdById: d.createdById,
      createdAt: d.createdAt,
      attachments: d.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        createdAt: a.createdAt,
      })),
    })),
    attachments: r.attachments.map((a) => ({
      id: a.id,
      url: a.url,
      fileName: a.fileName,
      mimeType: a.mimeType,
      createdAt: a.createdAt,
    })),
  };
}
