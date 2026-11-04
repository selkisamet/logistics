import { z } from 'zod';
import { upperStr, upperOpt } from '../text';
import { vehicleSummarySchema } from './vehicle';

// ---------------------------------------------------------------------------
// Depo içi sevk bölgesi
// ---------------------------------------------------------------------------

/**
 * Bölgesi bilinmeyen malın depodaki alanı. Kayıt DEĞİL — `regionId = null`.
 * Teslim yeri sonradan öğrenilince bölge girilir, depocuya "yer değiştir" düşer.
 */
export const PENDING_REGION_LABEL = 'BEKLEYEN';

export const createRegionSchema = z.object({
  name: upperStr(z.string().min(2, 'Bölge adı gerekli')),
  sortOrder: z.coerce.number().int().optional(),
});
export type CreateRegionInput = z.infer<typeof createRegionSchema>;

export const updateRegionSchema = createRegionSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;

export const regionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});
export type Region = z.infer<typeof regionSchema>;

export const regionSummarySchema = z.object({ id: z.string(), name: z.string() });
export type RegionSummary = z.infer<typeof regionSummarySchema>;

/** Mal kabulün gideceği bölgeyi değiştirir (null = BEKLEYEN). */
export const setReceiptRegionSchema = z.object({
  regionId: z.string().nullable(),
});
export type SetReceiptRegionInput = z.infer<typeof setReceiptRegionSchema>;

// ---------------------------------------------------------------------------
// Yükleme görevi — aracı yüke gönderirken açılır, depoda PLAKAYLA eşleşir
// ---------------------------------------------------------------------------

export const PICKUP_TASK_STATUSES = ['OPEN', 'RECEIVED', 'CANCELLED'] as const;
export type PickupTaskStatus = (typeof PICKUP_TASK_STATUSES)[number];

export const PICKUP_TASK_STATUS_LABELS: Record<PickupTaskStatus, string> = {
  OPEN: 'Yolda',
  RECEIVED: 'Depoya geldi',
  CANCELLED: 'İptal',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz tarih');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Geçersiz saat');

export const createPickupTaskSchema = z.object({
  customerId: z.string().min(1, 'Gönderici seçilmeli'),
  vehicleId: z.string().min(1, 'Araç seçilmeli'),
  regionId: z.string().optional(), // biliniyorsa — yoksa mal BEKLEYEN alanına iner
  recipientCustomerId: z.string().optional(),
  note: upperOpt(),
  // Tahmini depoya geliş — gün (YYYY-MM-DD) + opsiyonel saat (HH:MM)
  expectedDate: isoDate.optional(),
  expectedTime: hhmm.optional(),
});
export type CreatePickupTaskInput = z.infer<typeof createPickupTaskSchema>;

/** `undefined` = dokunma, `null` = temizle. */
export const updatePickupTaskSchema = z.object({
  customerId: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  regionId: z.string().nullable().optional(),
  recipientCustomerId: z.string().nullable().optional(),
  note: upperOpt(),
  expectedDate: isoDate.nullable().optional(),
  expectedTime: hhmm.nullable().optional(),
});
export type UpdatePickupTaskInput = z.infer<typeof updatePickupTaskSchema>;

export const pickupTaskListQuerySchema = z.object({
  status: z.enum(PICKUP_TASK_STATUSES).optional(),
});
export type PickupTaskListQuery = z.infer<typeof pickupTaskListQuerySchema>;

const partySchema = z.object({ id: z.string(), name: z.string() });

export const pickupTaskSchema = z.object({
  id: z.string(),
  status: z.enum(PICKUP_TASK_STATUSES),
  customer: partySchema,
  vehicle: vehicleSummarySchema,
  region: regionSummarySchema.nullable(),
  recipientCustomer: partySchema.nullable(),
  note: z.string().nullable(),
  expectedDate: z.string().nullable(), // YYYY-MM-DD
  expectedTime: z.string().nullable(), // HH:MM
  receiptId: z.string().nullable(),
  receiptReference: z.string().nullable(),
  createdBy: z.string().nullable(), // açanın adı
  createdAt: z.string(),
});
export type PickupTask = z.infer<typeof pickupTaskSchema>;
