import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import { datedReference, randomCode } from '../common/codes';
import {
  ReceiptStatus,
  ShipmentStatus,
  type CreatePackageInput,
  type ReceiptListQuery,
  type StartReceiptInput,
  type UpsertReceiptLineInput,
} from '@lojistik/shared';

const RECEIPT_INCLUDE = {
  customer: { select: { id: true, name: true, code: true, address: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  shipment: {
    select: {
      reference: true,
      vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
      principalName: true,
      loadAddress: true,
      deliveryAddress: true,
      paymentType: true,
      showAmountOnSlip: true,
      vatIncluded: true,
      sources: { select: { label: true, address: true } },
      recipients: { select: { label: true, address: true } },
    },
  },
  lines: { orderBy: { createdAt: 'asc' } as const },
  packages: { orderBy: { createdAt: 'desc' } as const },
  discrepancies: {
    orderBy: { createdAt: 'desc' } as const,
    include: { attachments: { orderBy: { createdAt: 'asc' } as const } },
  },
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
      // Palet bazlı: en az bir paleti hâlâ depoda olan kabuller (kısmi sevk desteklenir)
      packages: { some: { dispatchedAt: null, dispatchId: null } },
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { waybillNo: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
        include: RECEIPT_INCLUDE,
        orderBy: { completedAt: 'asc' }, // en uzun bekleyen üstte
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

  async start(input: StartReceiptInput, userId: string) {
    if (input.asnId) {
      return this.startFromAsn(input.asnId, userId, input.notes);
    }
    // Kör kabul (blind)
    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: input.customerId! } }),
      this.prisma.warehouse.findUnique({ where: { id: input.warehouseId! } }),
    ]);
    if (!customer) throw new BadRequestException('Geçersiz müşteri');
    if (!warehouse) throw new BadRequestException('Geçersiz depo');

    const receipt = await this.createWithUniqueRef((reference) =>
      this.prisma.receipt.create({
        data: {
          reference,
          status: ReceiptStatus.IN_PROGRESS,
          customerId: customer.id,
          warehouseId: warehouse.id,
          notes: input.notes,
          startedById: userId,
        },
        include: RECEIPT_INCLUDE,
      }),
    );
    await this.audit('receipt.started', 'Receipt', receipt.id, userId, { mode: 'blind' });
    return serializeReceipt(receipt);
  }

  private async startFromAsn(asnId: string, userId: string, notes?: string) {
    const shipment = await this.prisma.inboundShipment.findUnique({
      where: { id: asnId },
      include: { lines: true },
    });
    if (!shipment) throw new NotFoundException('Ön ihbar bulunamadı');
    if (shipment.status === ShipmentStatus.COMPLETED || shipment.status === ShipmentStatus.CANCELLED) {
      throw new BadRequestException('Bu ön ihbar için mal kabul yapılamaz');
    }

    // Devam eden bir kabul varsa onu sürdür
    const existing = await this.prisma.receipt.findFirst({
      where: { shipmentId: asnId, status: ReceiptStatus.IN_PROGRESS },
      include: RECEIPT_INCLUDE,
    });
    if (existing) return serializeReceipt(existing);

    const receipt = await this.createWithUniqueRef((reference) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.receipt.create({
          data: {
            reference,
            status: ReceiptStatus.IN_PROGRESS,
            shipmentId: shipment.id,
            customerId: shipment.customerId,
            warehouseId: shipment.warehouseId,
            notes,
            startedById: userId,
            lines: {
              create: shipment.lines.map((l) => ({
                sku: l.sku,
                description: l.description,
                expectedQty: l.expectedQty,
                countedQty: 0,
                unit: l.unit,
                barcode: l.barcode,
                unitPrice: l.unitPrice,
                shipmentLineId: l.id,
              })),
            },
          },
          include: RECEIPT_INCLUDE,
        });
        await tx.inboundShipment.update({
          where: { id: shipment.id },
          data: { status: ShipmentStatus.IN_RECEIVING },
        });
        return created;
      }),
    );
    await this.audit('receipt.started', 'Receipt', receipt.id, userId, { mode: 'asn', asnId });
    return serializeReceipt(receipt);
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

function serializeReceipt(r: ReceiptWithRelations) {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    asnId: r.shipmentId,
    asnReference: r.shipment?.reference ?? null,
    plannedVehicle: r.shipment?.vehicle ?? null,
    customerId: r.customerId,
    customer: r.customer,
    warehouseId: r.warehouseId,
    warehouse: r.warehouse,
    notes: r.notes,
    waybillNo: r.waybillNo,
    orderNo: r.orderNo,
    // Ön ihbardan taşınan taraf/adres/ödeme bilgileri (fiş için)
    principalName: r.shipment?.principalName ?? null,
    loadAddress: r.shipment?.loadAddress ?? null,
    deliveryAddress: r.shipment?.deliveryAddress ?? null,
    paymentType: (r.shipment?.paymentType ?? null) as 'SENDER' | 'RECIPIENT' | null,
    showAmountOnSlip: r.shipment?.showAmountOnSlip ?? false,
    vatIncluded: r.shipment?.vatIncluded ?? false,
    sources: r.shipment?.sources?.map((s) => ({ label: s.label, address: s.address })) ?? [],
    recipients:
      r.shipment?.recipients?.map((rec) => ({ label: rec.label, address: rec.address })) ?? [],
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
  };
}
