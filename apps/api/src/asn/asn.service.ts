import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginate } from '../common/pagination';
import { datedReference } from '../common/codes';
import { ShipmentStatus, type AsnListQuery, type CreateAsnInput, type UpdateAsnInput } from '@lojistik/shared';

const SHIPMENT_INCLUDE = {
  customer: { select: { id: true, name: true, code: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
  sources: true,
  recipients: true,
  lines: {
    orderBy: { sku: 'asc' },
    include: { receiptLines: { select: { countedQty: true } } },
  },
} satisfies Prisma.InboundShipmentInclude;

@Injectable()
export class AsnService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AsnListQuery) {
    const { page, pageSize, search, status, customerId } = query;
    const where: Prisma.InboundShipmentWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
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
      this.prisma.inboundShipment.findMany({
        where,
        include: SHIPMENT_INCLUDE,
        orderBy: [{ expectedAt: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inboundShipment.count({ where }),
    ]);

    return paginate(items.map(serializeShipment), total, page, pageSize);
  }

  async findOne(id: string) {
    const shipment = await this.prisma.inboundShipment.findUnique({
      where: { id },
      include: SHIPMENT_INCLUDE,
    });
    if (!shipment) throw new NotFoundException('Ön ihbar bulunamadı');
    return serializeShipment(shipment);
  }

  async create(input: CreateAsnInput) {
    await this.ensureCustomerAndWarehouse(input.customerId, input.warehouseId);
    const sources = await this.validateSources(input.customerId, input.sources);
    const recipients = await this.validateRecipients(input.customerId, input.recipients);
    if (input.reference) await this.ensureReferenceFree(input.reference);

    const data = {
      customerId: input.customerId,
      warehouseId: input.warehouseId,
      vehicleId: input.vehicleId || null,
      expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
      notes: input.notes,
      principalName: input.principalName || null,
      // Yükleme/teslimat adresi seçilen kaynak/alıcı kayıtlarının adresinden türetilir.
      loadAddress: joinAddresses(sources),
      deliveryAddress: joinAddresses(recipients),
      paymentType: input.paymentType ?? null,
      showAmountOnSlip: input.showAmountOnSlip ?? false,
      vatIncluded: input.vatIncluded ?? false,
      status: ShipmentStatus.EXPECTED,
      lines: { create: input.lines.map(toLineData) },
      sources: { create: sources.map(({ customerLocationId, label }) => ({ customerLocationId, label })) },
      recipients: {
        create: recipients.map(({ customerRecipientId, label }) => ({ customerRecipientId, label })),
      },
    };

    // Referans verilmediyse otomatik üret (ON-...), çakışmada yeniden dene
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      const reference = input.reference || datedReference('ON');
      try {
        const shipment = await this.prisma.inboundShipment.create({
          data: { ...data, reference },
          include: SHIPMENT_INCLUDE,
        });
        return serializeShipment(shipment);
      } catch (err) {
        if (
          !input.reference &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async update(id: string, input: UpdateAsnInput) {
    const existing = await this.prisma.inboundShipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ön ihbar bulunamadı');
    if (existing.status === ShipmentStatus.COMPLETED) {
      throw new BadRequestException('Tamamlanmış ön ihbar düzenlenemez');
    }
    if (input.reference && input.reference !== existing.reference) {
      await this.ensureReferenceFree(input.reference);
    }

    const sources =
      input.sources !== undefined
        ? await this.validateSources(input.customerId ?? existing.customerId, input.sources)
        : undefined;
    const recipients =
      input.recipients !== undefined
        ? await this.validateRecipients(input.customerId ?? existing.customerId, input.recipients)
        : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Satırlar verildiyse hepsini değiştir (mal kabul başlamadıysa güvenli)
      if (input.lines) {
        if (existing.status === ShipmentStatus.IN_RECEIVING) {
          throw new BadRequestException('Mal kabul başladıktan sonra satırlar değiştirilemez');
        }
        await tx.shipmentLine.deleteMany({ where: { shipmentId: id } });
        await tx.shipmentLine.createMany({
          data: input.lines.map((l) => ({ ...toLineData(l), shipmentId: id })),
        });
      }

      // Kaynaklar verildiyse hepsini değiştir
      if (sources) {
        await tx.shipmentSource.deleteMany({ where: { shipmentId: id } });
        await tx.shipmentSource.createMany({
          data: sources.map(({ customerLocationId, label }) => ({ customerLocationId, label, shipmentId: id })),
        });
      }

      // Alıcılar verildiyse hepsini değiştir
      if (recipients) {
        await tx.shipmentRecipient.deleteMany({ where: { shipmentId: id } });
        await tx.shipmentRecipient.createMany({
          data: recipients.map(({ customerRecipientId, label }) => ({
            customerRecipientId,
            label,
            shipmentId: id,
          })),
        });
      }

      return tx.inboundShipment.update({
        where: { id },
        data: {
          reference: input.reference,
          customerId: input.customerId,
          warehouseId: input.warehouseId,
          vehicleId: input.vehicleId === undefined ? undefined : input.vehicleId || null,
          expectedAt:
            input.expectedAt === undefined ? undefined : input.expectedAt ? new Date(input.expectedAt) : null,
          notes: input.notes,
          principalName: input.principalName === undefined ? undefined : input.principalName || null,
          // Adresler seçilen kaynak/alıcıdan; yalnızca ilgili liste verildiyse güncelle
          loadAddress: sources ? joinAddresses(sources) : undefined,
          deliveryAddress: recipients ? joinAddresses(recipients) : undefined,
          paymentType: input.paymentType === undefined ? undefined : input.paymentType ?? null,
          showAmountOnSlip: input.showAmountOnSlip,
          vatIncluded: input.vatIncluded,
          status: input.status,
        },
        include: SHIPMENT_INCLUDE,
      });
    });

    return serializeShipment(updated);
  }

  /** Planlanan aracı değiştirir; ön ihbar tamamlanmış (mal depoda) olsa bile izin verilir. */
  async setVehicle(id: string, vehicleId?: string) {
    const existing = await this.prisma.inboundShipment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Ön ihbar bulunamadı');
    if (existing.status === ShipmentStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş ön ihbarın aracı değiştirilemez');
    }
    if (vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
      if (!vehicle) throw new BadRequestException('Geçersiz araç seçimi');
    }
    const updated = await this.prisma.inboundShipment.update({
      where: { id },
      data: { vehicleId: vehicleId || null },
      include: SHIPMENT_INCLUDE,
    });
    return serializeShipment(updated);
  }

  async cancel(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.inboundShipment.update({
      where: { id },
      data: { status: ShipmentStatus.CANCELLED },
      include: SHIPMENT_INCLUDE,
    });
    return serializeShipment(updated);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.inboundShipment.delete({ where: { id } });
    return { success: true };
  }

  private async ensureReferenceFree(reference: string) {
    const found = await this.prisma.inboundShipment.findUnique({ where: { reference } });
    if (found) throw new ConflictException('Bu referans no zaten kullanılıyor');
  }

  /** Kaynakları doğrular; kayıtlı depo seçildiyse etiket+adres depo kaydından sabitlenir. */
  private async validateSources(
    customerId: string,
    sources: CreateAsnInput['sources'],
  ): Promise<{ customerLocationId: string | null; label: string; address: string | null }[]> {
    if (!sources || sources.length === 0) return [];

    const ids = sources.map((s) => s.customerLocationId).filter((x): x is string => !!x);
    const locations = ids.length
      ? await this.prisma.customerLocation.findMany({ where: { id: { in: ids }, customerId } })
      : [];
    const byId = new Map(locations.map((l) => [l.id, l]));

    return sources.map((s) => {
      if (s.customerLocationId) {
        const loc = byId.get(s.customerLocationId);
        if (!loc) throw new BadRequestException('Geçersiz kaynak depo seçimi');
        return { customerLocationId: loc.id, label: loc.name, address: loc.address };
      }
      return { customerLocationId: null, label: s.label, address: null };
    });
  }

  /** Alıcıları doğrular; kayıtlı alıcı seçildiyse etiket+adres alıcı kaydından sabitlenir. */
  private async validateRecipients(
    customerId: string,
    recipients: CreateAsnInput['recipients'],
  ): Promise<{ customerRecipientId: string | null; label: string; address: string | null }[]> {
    if (!recipients || recipients.length === 0) return [];

    const ids = recipients.map((r) => r.customerRecipientId).filter((x): x is string => !!x);
    const found = ids.length
      ? await this.prisma.customerRecipient.findMany({ where: { id: { in: ids }, customerId } })
      : [];
    const byId = new Map(found.map((r) => [r.id, r]));

    return recipients.map((r) => {
      if (r.customerRecipientId) {
        const rec = byId.get(r.customerRecipientId);
        if (!rec) throw new BadRequestException('Geçersiz alıcı seçimi');
        return { customerRecipientId: rec.id, label: rec.name, address: rec.address };
      }
      return { customerRecipientId: null, label: r.label, address: null };
    });
  }

  private async ensureCustomerAndWarehouse(customerId: string, warehouseId: string) {
    const [customer, warehouse] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId } }),
      this.prisma.warehouse.findUnique({ where: { id: warehouseId } }),
    ]);
    if (!customer) throw new BadRequestException('Geçersiz müşteri');
    if (!warehouse) throw new BadRequestException('Geçersiz depo');
  }
}

/** Seçili kaynak/alıcı adreslerini tekilleştirip birleştirir (fiş yükleme/teslimat adresi). */
function joinAddresses(arr: { address: string | null }[]): string | null {
  const addrs = arr.map((x) => x.address).filter((a): a is string => !!a);
  return addrs.length ? Array.from(new Set(addrs)).join(' / ') : null;
}

function toLineData(line: CreateAsnInput['lines'][number]) {
  return {
    sku: line.sku?.trim() || '',
    description: line.description,
    expectedQty: line.expectedQty,
    unit: line.unit,
    barcode: line.barcode,
    unitPrice: line.unitPrice ?? null,
  };
}

type ShipmentWithRelations = Prisma.InboundShipmentGetPayload<{ include: typeof SHIPMENT_INCLUDE }>;

function serializeShipment(s: ShipmentWithRelations) {
  return {
    id: s.id,
    reference: s.reference,
    status: s.status,
    customerId: s.customerId,
    customer: s.customer,
    warehouseId: s.warehouseId,
    warehouse: s.warehouse,
    vehicleId: s.vehicleId,
    vehicle: s.vehicle,
    sources: s.sources.map((src) => ({
      id: src.id,
      customerLocationId: src.customerLocationId,
      label: src.label,
    })),
    recipients: s.recipients.map((rec) => ({
      id: rec.id,
      customerRecipientId: rec.customerRecipientId,
      label: rec.label,
    })),
    expectedAt: s.expectedAt,
    notes: s.notes,
    principalName: s.principalName,
    loadAddress: s.loadAddress,
    deliveryAddress: s.deliveryAddress,
    paymentType: s.paymentType as 'SENDER' | 'RECIPIENT' | null,
    showAmountOnSlip: s.showAmountOnSlip,
    vatIncluded: s.vatIncluded,
    createdAt: s.createdAt,
    lines: s.lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      description: l.description,
      expectedQty: l.expectedQty,
      unit: l.unit,
      barcode: l.barcode,
      unitPrice: l.unitPrice === null ? null : Number(l.unitPrice),
      receivedQty: l.receiptLines.reduce((sum, r) => sum + r.countedQty, 0),
    })),
  };
}
