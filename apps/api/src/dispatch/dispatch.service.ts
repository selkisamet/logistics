import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import { datedReference } from '../common/codes';
import {
  DispatchStatus,
  ReceiptStatus,
  type AddDispatchPackageInput,
  type CreateDispatchInput,
  type DispatchListQuery,
  type QuickDispatchInput,
} from '@lojistik/shared';

const DISPATCH_INCLUDE = {
  vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
  packages: {
    include: {
      receipt: {
        select: {
          reference: true,
          waybillNo: true,
          customer: { select: { name: true } },
          shipment: {
            select: { vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  // Paletsiz (kabul düzeyi) sevkler için bağlı kabuller
  receipts: {
    select: {
      id: true,
      reference: true,
      customer: { select: { name: true } },
      lines: { select: { countedQty: true } },
    },
  },
} satisfies Prisma.DispatchInclude;

type DispatchWithRelations = Prisma.DispatchGetPayload<{ include: typeof DISPATCH_INCLUDE }>;

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
      },
    });
    if (!receipt) throw new NotFoundException('Mal kabul kaydı bulunamadı');
    if (receipt.status !== ReceiptStatus.COMPLETED) {
      throw new BadRequestException('Bu kabulün mal kabulü henüz tamamlanmadı');
    }
    const palletIds = receipt.packages.map((p) => p.id);
    const paletless = palletIds.length === 0;
    // Paletsiz kabul: kabul düzeyinde sevk (QR opsiyonel). Zaten sevk edildiyse engelle.
    if (paletless && receipt.dispatchId) {
      throw new BadRequestException('Bu mal kabul zaten sevk edildi');
    }

    const vehicleId = input.vehicleId || receipt.shipment?.vehicleId || null;
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) throw new BadRequestException('Geçersiz araç seçimi');
    }
    const destination = input.destination?.trim() || receipt.customer?.name || 'Sevkiyat';

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
            },
          });
          if (paletless) {
            // Kabul düzeyinde sevk: receipt'i sevkiyata bağla
            await tx.receipt.update({
              where: { id: receipt.id },
              data: { dispatchId: created.id, dispatchedAt: now },
            });
          } else {
            await tx.package.updateMany({
              where: { id: { in: palletIds } },
              data: { dispatchId: created.id, dispatchedAt: now },
            });
          }
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

    const pkg = input.packageId
      ? await this.prisma.package.findUnique({
          where: { id: input.packageId },
          include: { receipt: { select: { status: true } } },
        })
      : await this.prisma.package.findUnique({
          where: { code: input.packageCode!.trim() },
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

    if (input.wholeReceipt) {
      // Okutulan paletin ait olduğu girişteki tüm depodaki paletleri ekle
      await this.prisma.package.updateMany({
        where: { receiptId: pkg.receiptId, dispatchedAt: null, dispatchId: null },
        data: { dispatchId: id },
      });
    } else if (pkg.dispatchId !== id) {
      await this.prisma.package.update({ where: { id: pkg.id }, data: { dispatchId: id } });
    }
    return this.findOne(id);
  }

  /** Toplu palet ekleme: depodaki uygun paletleri (tamamlanmış kabul, sevk edilmemiş) tek seferde ekler. */
  async addPackages(id: string, packageIds: string[]) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    await this.prisma.package.updateMany({
      where: { id: { in: packageIds }, dispatchedAt: null, dispatchId: null },
      data: { dispatchId: id },
    });
    return this.findOne(id);
  }

  async removePackage(id: string, packageId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    await this.prisma.package.updateMany({
      where: { id: packageId, dispatchId: id },
      data: { dispatchId: null },
    });
    return this.findOne(id);
  }

  async complete(id: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    this.ensureDraft(dispatch);
    if (dispatch.packages.length === 0) {
      throw new BadRequestException('Sevkiyata en az bir palet ekleyin');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.package.updateMany({ where: { dispatchId: id }, data: { dispatchedAt: now } });
      return tx.dispatch.update({
        where: { id },
        data: { status: DispatchStatus.DISPATCHED, dispatchedAt: now, dispatchedById: userId },
        include: DISPATCH_INCLUDE,
      });
    });
    await this.audit('dispatch.completed', id, userId, { palletCount: updated.packages.length });
    return serializeDispatch(updated);
  }

  async cancel(id: string, userId: string) {
    const dispatch = await this.getOrThrow(id);
    if (dispatch.status === DispatchStatus.CANCELLED) return serializeDispatch(dispatch);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Paletleri depoya geri al
      await tx.package.updateMany({
        where: { dispatchId: id },
        data: { dispatchId: null, dispatchedAt: null },
      });
      return tx.dispatch.update({
        where: { id },
        data: { status: DispatchStatus.CANCELLED },
        include: DISPATCH_INCLUDE,
      });
    });
    await this.audit('dispatch.cancelled', id, userId);
    return serializeDispatch(updated);
  }

  // ---- helpers ----

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
    packages: d.packages.map((p) => ({
      id: p.id,
      code: p.code,
      type: p.type,
      customerName: p.receipt.customer?.name ?? null,
      receiptReference: p.receipt.reference,
      waybillNo: p.receipt.waybillNo,
      plannedVehicle: p.receipt.shipment?.vehicle ?? null,
    })),
    receipts: d.receipts.map((r) => ({
      id: r.id,
      reference: r.reference,
      customerName: r.customer?.name ?? null,
      itemCount: r.lines.reduce((s, l) => s + l.countedQty, 0),
    })),
  };
}
