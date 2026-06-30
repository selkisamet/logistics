import { z } from 'zod';
import { SHIPMENT_STATUSES, ShipmentStatus } from '../enums';
import { paginationQuerySchema } from './common';

/** Beklenen sevkiyat satırı (ürün + beklenen adet) */
export const expectedLineSchema = z.object({
  sku: z.string().optional(), // opsiyonel: müşteri ürün kodu/varsa
  description: z.string().min(1, 'Ürün açıklaması gerekli'),
  expectedQty: z.coerce.number().int().positive('Adet pozitif olmalı'),
  unit: z.string().default('ADET'),
  barcode: z.string().optional(),
});
export type ExpectedLineInput = z.infer<typeof expectedLineSchema>;

/** Kaynak (pickup): kayıtlı müşteri deposu (customerLocationId) ya da serbest metin. */
export const shipmentSourceInputSchema = z.object({
  customerLocationId: z.string().optional(),
  label: z.string().min(1, 'Kaynak adı gerekli'),
});
export type ShipmentSourceInput = z.infer<typeof shipmentSourceInputSchema>;

export const createAsnSchema = z.object({
  reference: z.string().optional(), // boşsa sunucu otomatik üretir (ON-...)
  customerId: z.string().min(1, 'Müşteri seçilmeli'),
  warehouseId: z.string().min(1, 'Hedef depo seçilmeli'),
  sources: z.array(shipmentSourceInputSchema).optional().default([]), // çoklu kaynak depo/adres
  vehicleId: z.string().optional(), // plaka belli değilse boş
  expectedAt: z.string().optional(), // ISO tarih
  notes: z.string().optional(),
  lines: z.array(expectedLineSchema).min(1, 'En az bir satır ekleyin'),
});
export type CreateAsnInput = z.infer<typeof createAsnSchema>;

export const updateAsnSchema = createAsnSchema.partial().extend({
  status: z.enum(SHIPMENT_STATUSES as [ShipmentStatus, ...ShipmentStatus[]]).optional(),
});
export type UpdateAsnInput = z.infer<typeof updateAsnSchema>;

/** Planlanan aracı değiştirme (boş = aracı kaldır). İptal hariç her durumda yapılabilir. */
export const updateAsnVehicleSchema = z.object({
  vehicleId: z.string().optional(),
});
export type UpdateAsnVehicleInput = z.infer<typeof updateAsnVehicleSchema>;

export const asnLineSchema = expectedLineSchema.extend({
  id: z.string(),
  receivedQty: z.number().int().default(0),
});

export const asnListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(SHIPMENT_STATUSES as [ShipmentStatus, ...ShipmentStatus[]]).optional(),
  customerId: z.string().optional(),
});
export type AsnListQuery = z.infer<typeof asnListQuerySchema>;

/** İnsan-okunur durum etiketleri (UI için) */
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: 'Taslak',
  EXPECTED: 'Beklenen',
  IN_RECEIVING: 'Mal Kabulde',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};

export const asnSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(SHIPMENT_STATUSES as [ShipmentStatus, ...ShipmentStatus[]]),
  customerId: z.string(),
  customer: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
  warehouseId: z.string(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
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
  sources: z
    .array(
      z.object({
        id: z.string(),
        customerLocationId: z.string().nullable(),
        label: z.string(),
      }),
    )
    .default([]),
  expectedAt: z.string().nullable(),
  notes: z.string().nullable(),
  lines: z.array(asnLineSchema),
  createdAt: z.string(),
});
export type Asn = z.infer<typeof asnSchema>;
