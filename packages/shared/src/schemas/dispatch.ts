import { z } from 'zod';
import { DISPATCH_STATUSES, DispatchStatus } from '../enums';
import { paginationQuerySchema } from './common';
import { vehicleSummarySchema } from './vehicle';

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Hazırlanıyor',
  DISPATCHED: 'Sevk edildi',
  CANCELLED: 'İptal',
};

export const createDispatchSchema = z.object({
  destination: z.string().min(1, 'Hedef/alıcı gerekli'),
  vehicleId: z.string().optional(), // kayıtlı araç seçildiyse
  vehiclePlate: z.string().optional(), // ya da elle plaka (kayıtsız araç)
  driverName: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;

/** Sevkiyata palet ekleme: QR kodu (PKG-...) okutarak ya da id ile. */
export const addDispatchPackageSchema = z
  .object({
    packageId: z.string().optional(),
    packageCode: z.string().optional(),
    // true ise: okutulan paletin ait olduğu kabuldeki TÜM depodaki paletleri ekler
    wholeReceipt: z.boolean().optional(),
  })
  .refine((v) => !!v.packageId || !!v.packageCode, {
    message: 'Paket id ya da QR kodu gerekli',
  });
export type AddDispatchPackageInput = z.infer<typeof addDispatchPackageSchema>;

/** Toplu palet ekleme (Hepsini Ekle). */
export const bulkAddDispatchPackagesSchema = z.object({
  packageIds: z.array(z.string()).min(1, 'En az bir palet seçilmeli'),
});
export type BulkAddDispatchPackagesInput = z.infer<typeof bulkAddDispatchPackagesSchema>;

/**
 * Hızlı sevk: depodaki bir kabulün tüm paletlerini, planlanan araçla (ya da seçilen
 * kayıtlı araçla) tek adımda sevk eder. Plaka elle girilmez — kayıtlı araç seçilir.
 */
export const quickDispatchSchema = z.object({
  receiptId: z.string().min(1, 'Kabul gerekli'),
  vehicleId: z.string().optional(), // boşsa ön ihbarda planlanan araç kullanılır
  destination: z.string().optional(), // boşsa müşteri adı kullanılır
});
export type QuickDispatchInput = z.infer<typeof quickDispatchSchema>;

/** Sevkiyat içindeki paletin özet görünümü. */
export const dispatchPackageSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: z.string(),
  customerName: z.string().nullable(),
  receiptReference: z.string(),
  waybillNo: z.string().nullable(),
  plannedVehicle: vehicleSummarySchema.nullable().optional(), // ön ihbarda planlanan araç
});
export type DispatchPackage = z.infer<typeof dispatchPackageSchema>;

export const dispatchSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(DISPATCH_STATUSES as [DispatchStatus, ...DispatchStatus[]]),
  destination: z.string(),
  vehiclePlate: z.string().nullable(),
  driverName: z.string().nullable(),
  vehicleId: z.string().nullable().optional(),
  vehicle: z
    .object({
      id: z.string(),
      plate: z.string(),
      driverName: z.string().nullable(),
      trailerPlate: z.string().nullable(),
    })
    .nullable()
    .optional(),
  notes: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  createdAt: z.string(),
  packages: z.array(dispatchPackageSchema),
});
export type Dispatch = z.infer<typeof dispatchSchema>;

export const dispatchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DISPATCH_STATUSES as [DispatchStatus, ...DispatchStatus[]]).optional(),
});
export type DispatchListQuery = z.infer<typeof dispatchListQuerySchema>;
