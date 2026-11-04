import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PickupTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePickupTaskInput,
  PickupTaskListQuery,
  UpdatePickupTaskInput,
} from '@lojistik/shared';

const TASK_INCLUDE = {
  customer: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, driverName: true, trailerPlate: true } },
  region: { select: { id: true, name: true } },
  recipientCustomer: { select: { id: true, name: true } },
  receipt: { select: { reference: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.PickupTaskInclude;

type TaskWithRelations = Prisma.PickupTaskGetPayload<{ include: typeof TASK_INCLUDE }>;

/** Biten görevlerden listede kaç tane gösterilsin — geçmiş arşiv değil, son durum. */
const CLOSED_LIMIT = 30;

/**
 * Yükleme görevi: yönetici/sevkiyat müdürü aracı yüke gönderirken açar.
 * Depoda mal kabul başlatılırken açık görevler PLAKA olarak listelenir; depocu
 * gelen araca dokunur, kabul gönderici/alıcı/bölge dolu açılır (ReceiptsService.start).
 * Görev ZORUNLU DEĞİL — eski ön ihbar akışı zorunlu olduğu için kaldırılmıştı.
 */
@Injectable()
export class PickupTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PickupTaskListQuery) {
    const items = await this.prisma.pickupTask.findMany({
      where: query.status ? { status: query.status } : {},
      include: TASK_INCLUDE,
      // Açıklar GELİŞ sırasıyla (tarih, saat; bilinmeyenler sonda), bitenler yeniden eskiye
      orderBy:
        query.status === 'OPEN'
          ? [
              { expectedDate: { sort: 'asc', nulls: 'last' } },
              { expectedTime: { sort: 'asc', nulls: 'last' } },
              { createdAt: 'asc' },
            ]
          : { updatedAt: 'desc' },
      take: query.status === 'OPEN' ? undefined : CLOSED_LIMIT,
    });
    return items.map(serializeTask);
  }

  async create(input: CreatePickupTaskInput, userId: string) {
    await this.validate(input);
    const task = await this.prisma.pickupTask.create({
      data: {
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        regionId: input.regionId || null,
        recipientCustomerId: input.recipientCustomerId || null,
        note: input.note,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        expectedTime: input.expectedDate ? (input.expectedTime ?? null) : null,
        createdById: userId,
      },
      include: TASK_INCLUDE,
    });
    await this.audit('pickup.created', task.id, userId, {
      plate: task.vehicle.plate,
      customer: task.customer.name,
    });
    return serializeTask(task);
  }

  /** Yalnız yoldaki (açık) görev düzenlenir — depoya gelen yükün bilgisi artık mal kabulde. */
  async update(id: string, input: UpdatePickupTaskInput, userId: string) {
    await this.getOpenOrThrow(id);
    await this.validate(input);
    const task = await this.prisma.pickupTask.update({
      where: { id },
      data: {
        customerId: input.customerId,
        vehicleId: input.vehicleId,
        regionId: input.regionId === undefined ? undefined : input.regionId || null,
        recipientCustomerId:
          input.recipientCustomerId === undefined ? undefined : input.recipientCustomerId || null,
        note: input.note,
        expectedDate:
          input.expectedDate === undefined
            ? undefined
            : input.expectedDate
              ? new Date(input.expectedDate)
              : null,
        // Gün temizlenirse saat de anlamsız — onu da temizle
        expectedTime:
          input.expectedDate === null
            ? null
            : input.expectedTime === undefined
              ? undefined
              : input.expectedTime,
      },
      include: TASK_INCLUDE,
    });
    await this.audit('pickup.updated', id, userId, {});
    return serializeTask(task);
  }

  async cancel(id: string, userId: string) {
    await this.getOpenOrThrow(id);
    const task = await this.prisma.pickupTask.update({
      where: { id },
      data: { status: PickupTaskStatus.CANCELLED },
      include: TASK_INCLUDE,
    });
    await this.audit('pickup.cancelled', id, userId, {});
    return serializeTask(task);
  }

  private async getOpenOrThrow(id: string) {
    const task = await this.prisma.pickupTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Görev bulunamadı');
    if (task.status !== PickupTaskStatus.OPEN) {
      throw new BadRequestException('Görev artık açık değil (araç depoya gelmiş ya da iptal)');
    }
    return task;
  }

  private async validate(input: {
    customerId?: string;
    vehicleId?: string;
    regionId?: string | null;
    recipientCustomerId?: string | null;
  }) {
    const [customer, vehicle, region, recipient] = await Promise.all([
      input.customerId ? this.prisma.customer.findUnique({ where: { id: input.customerId } }) : null,
      input.vehicleId ? this.prisma.vehicle.findUnique({ where: { id: input.vehicleId } }) : null,
      input.regionId ? this.prisma.region.findUnique({ where: { id: input.regionId } }) : null,
      input.recipientCustomerId
        ? this.prisma.customer.findUnique({ where: { id: input.recipientCustomerId } })
        : null,
    ]);
    if (input.customerId && !customer) throw new BadRequestException('Geçersiz gönderici');
    if (input.vehicleId && !vehicle) throw new BadRequestException('Geçersiz araç');
    if (input.regionId && (!region || !region.isActive)) {
      throw new BadRequestException('Geçersiz bölge');
    }
    if (input.recipientCustomerId && !recipient) throw new BadRequestException('Geçersiz alıcı');
  }

  private audit(action: string, entityId: string, userId: string, metadata: Prisma.InputJsonValue) {
    return this.prisma.auditEvent.create({
      data: { action, entityType: 'PickupTask', entityId, userId, metadata },
    });
  }
}

function serializeTask(t: TaskWithRelations) {
  return {
    id: t.id,
    status: t.status,
    customer: t.customer,
    vehicle: t.vehicle,
    region: t.region,
    recipientCustomer: t.recipientCustomer,
    note: t.note,
    expectedDate: t.expectedDate ? t.expectedDate.toISOString().slice(0, 10) : null,
    expectedTime: t.expectedTime,
    receiptId: t.receiptId,
    receiptReference: t.receipt?.reference ?? null,
    createdBy: t.createdBy?.fullName ?? null,
    createdAt: t.createdAt,
  };
}
