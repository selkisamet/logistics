import { z } from 'zod';
import { RECEIPT_STATUSES, ReceiptStatus, PACKAGE_TYPES, PackageType } from '../enums';
import { paginationQuerySchema } from './common';
import { discrepancySchema } from './discrepancy';
import { vehicleSummarySchema } from './vehicle';

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  DRAFT: 'Taslak',
  IN_PROGRESS: 'Devam ediyor',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};

export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  PALLET: 'Palet',
  DRUM: 'Varil',
  CARTON: 'Koli',
  CASE: 'Kasa',
  BAG: 'Torba/Çuval',
  BIGBAG: 'Big-bag',
  UNIT: 'Adet',
  OTHER: 'Diğer',
};

/** Mal kabul başlatma: ASN'ye bağlı ya da "kör kabul" (blind). */
export const startReceiptSchema = z
  .object({
    asnId: z.string().optional(),
    // Blind kabul için müşteri ve depo doğrudan verilir.
    customerId: z.string().optional(),
    warehouseId: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => !!v.asnId || (!!v.customerId && !!v.warehouseId), {
    message: 'ASN seçin ya da kör kabul için müşteri ve depo belirtin',
  });
export type StartReceiptInput = z.infer<typeof startReceiptSchema>;

/** Tek bir satırın (ürünün) sayım kaydı/güncellemesi. */
export const upsertReceiptLineSchema = z.object({
  lineId: z.string().optional(), // mevcut satırı id ile güncelle (en güvenilir eşleşme)
  sku: z.string().optional().default(''), // ürün kodu (çoğu sevkiyatta yok)
  description: z.string().min(1, 'Açıklama gerekli'),
  countedQty: z.coerce.number().int().min(0),
  unit: z.string().default('ADET'),
  barcode: z.string().optional(),
  asnLineId: z.string().optional(), // beklenen satırla eşleşme
});
export type UpsertReceiptLineInput = z.infer<typeof upsertReceiptLineSchema>;

/** Koli/palet etiketi (QR) oluşturma. */
export const createPackageSchema = z.object({
  type: z.enum(PACKAGE_TYPES as [PackageType, ...PackageType[]]).default(PackageType.CARTON),
  count: z.coerce.number().int().min(1).max(500).default(1), // kaç adet benzersiz etiket
  sku: z.string().optional(),
  qty: z.coerce.number().int().positive().optional(),
  note: z.string().optional(),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const packageSchema = z.object({
  id: z.string(),
  code: z.string(), // QR'a basılacak benzersiz kod (SSCC benzeri)
  type: z.enum(PACKAGE_TYPES as [PackageType, ...PackageType[]]),
  sku: z.string().nullable(),
  qty: z.number().int().nullable(),
  note: z.string().nullable(),
  receiptId: z.string(),
  createdAt: z.string(),
  dispatchedAt: z.string().nullable().optional(), // doluysa sevk edilmiş
  dispatchId: z.string().nullable().optional(), // doluysa bir sevkiyatta (depoda görünmez)
});
export type Package = z.infer<typeof packageSchema>;

export const receiptLineSchema = z.object({
  id: z.string(),
  sku: z.string(),
  description: z.string(),
  expectedQty: z.number().int().nullable(),
  countedQty: z.number().int(),
  unit: z.string(),
  barcode: z.string().nullable(),
});
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

export const receiptSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(RECEIPT_STATUSES as [ReceiptStatus, ...ReceiptStatus[]]),
  asnId: z.string().nullable(),
  asnReference: z.string().nullable().optional(),
  plannedVehicle: vehicleSummarySchema.nullable().optional(), // ön ihbarda planlanan araç
  customerId: z.string(),
  customer: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
  warehouseId: z.string(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
  notes: z.string().nullable(),
  waybillNo: z.string().nullable().optional(),
  orderNo: z.string().nullable().optional(),
  lines: z.array(receiptLineSchema),
  packages: z.array(packageSchema).optional(),
  discrepancies: z.array(discrepancySchema).optional(),
  startedById: z.string().nullable(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Receipt = z.infer<typeof receiptSchema>;

/** Mal kabul bilgilerini güncelleme (irsaliye no / sipariş no / notlar). */
export const updateReceiptSchema = z.object({
  waybillNo: z.string().optional(),
  orderNo: z.string().optional(),
  notes: z.string().optional(),
});
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;

export const receiptListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(RECEIPT_STATUSES as [ReceiptStatus, ...ReceiptStatus[]]).optional(),
});
export type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>;
