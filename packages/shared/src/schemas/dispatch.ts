import { z } from 'zod';
import { DISPATCH_STATUSES, DispatchStatus } from '../enums';
import { paginationQuerySchema } from './common';
import { vehicleSummarySchema } from './vehicle';
import { upperStr, upperOpt, codeOpt } from '../text';

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Hazırlanıyor',
  DISPATCHED: 'Sevk edildi',
  CANCELLED: 'İptal',
};

export const createDispatchSchema = z.object({
  destination: upperStr(z.string().min(1, 'Hedef/alıcı gerekli')),
  vehicleId: z.string().optional(), // kayıtlı araç seçildiyse
  vehiclePlate: upperOpt(), // ya da elle plaka (kayıtsız araç)
  driverName: upperOpt(),
  notes: upperOpt(),
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
  destination: upperOpt(), // boşsa müşteri adı kullanılır
});
export type QuickDispatchInput = z.infer<typeof quickDispatchSchema>;

/** Sevkiyatın aracını/plakasını değiştir (yanlış plaka ile sevk edilirse düzeltme). */
export const changeDispatchVehicleSchema = z.object({
  vehicleId: z.string().min(1, 'Araç seçilmeli'),
});
export type ChangeDispatchVehicleInput = z.infer<typeof changeDispatchVehicleSchema>;

// ---- Çok duraklı teslimat (rota) ----

/** Durak ekle/düzenle. customerLocationId verilirse ad/adres/telefon kayıttan snapshot'lanır. */
export const createDispatchStopSchema = z
  .object({
    customerId: z.string().optional(), // alıcı = kayıtlı müşteri (opsiyonel)
    customerLocationId: z.string().optional(), // müşterinin boşaltma lokasyonu
    name: upperOpt(), // lokasyon seçilmediyse serbest metin (zorunlu)
    address: upperOpt(),
    phone: z.string().optional(),
    note: upperOpt(),
  })
  .refine((v) => !!v.customerLocationId || !!v.name?.trim(), {
    message: 'Durak adı gerekli (ya da kayıtlı bir lokasyon seçin)',
    path: ['name'],
  });
export type CreateDispatchStopInput = z.infer<typeof createDispatchStopSchema>;
export const updateDispatchStopSchema = createDispatchStopSchema;
export type UpdateDispatchStopInput = CreateDispatchStopInput;

/** Durakları yeniden sırala — verilen id sırası seq olur. */
export const reorderStopsSchema = z.object({
  stopIds: z.array(z.string()).min(1, 'En az bir durak gerekli'),
});
export type ReorderStopsInput = z.infer<typeof reorderStopsSchema>;

/** Palet/kabulleri bir durağa ata. stopId null gönderilirse atama kaldırılır. */
export const assignToStopSchema = z
  .object({
    itemIds: z.array(z.string()).optional(), // yeni: defter satırları
    packageIds: z.array(z.string()).optional(), // geriye uyum
    receiptIds: z.array(z.string()).optional(), // geriye uyum
  })
  .refine(
    (v) => (v.itemIds?.length ?? 0) + (v.packageIds?.length ?? 0) + (v.receiptIds?.length ?? 0) > 0,
    { message: 'En az bir yük seçilmeli' },
  );
export type AssignToStopInput = z.infer<typeof assignToStopSchema>;

// ---- Kalem bazlı yükleme ----

/** Depodan araca yük ekleme: ya bir palet (kap) ya da bir kabul kalemi + miktar.
 *  Kabul başına TEK mod: paleti varsa palet seçilir, yoksa kalem + miktar. */
export const loadEntrySchema = z
  .object({
    packageId: z.string().optional(),
    receiptLineId: z.string().optional(),
    qty: z.coerce.number().int().positive().optional(), // kalem satırında zorunlu
    stopId: z.string().nullable().optional(),
  })
  .refine((v) => !!v.packageId !== !!v.receiptLineId, {
    message: 'Palet ya da kalem — tam biri seçilmeli',
  })
  .refine((v) => !v.receiptLineId || (v.qty ?? 0) > 0, {
    message: 'Kalem için miktar gerekli',
    path: ['qty'],
  });
export type LoadEntryInput = z.infer<typeof loadEntrySchema>;

export const addDispatchItemsSchema = z.object({
  items: z.array(loadEntrySchema).min(1, 'En az bir yük seçilmeli'),
});
export type AddDispatchItemsInput = z.infer<typeof addDispatchItemsSchema>;

/** Sevkiyattaki bir yük satırı (kap ya da kalem) — belgeler ve UI bunu kullanır. */
export const dispatchItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['PACKAGE', 'LINE']),
  qty: z.number().int(),
  unit: z.string(),
  description: z.string(), // MALIN CİNSİ (snapshot)
  weightKg: z.number().nonnegative().nullable().optional(), // KİLO (snapshot, kısmi sevkte oransal)
  stopId: z.string().nullable().optional(),
  receiptId: z.string(),
  receiptReference: z.string(),
  receiptLineId: z.string().nullable().optional(),
  packageId: z.string().nullable().optional(),
  packageCode: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(), // GÖNDERİCİ
  warehouseName: z.string().nullable().optional(), // NEREDEN
  recipientName: z.string().nullable().optional(),
  waybillNo: z.string().nullable().optional(), // müşterinin SEVK İRSALİYE no'su
  plannedVehicle: vehicleSummarySchema.nullable().optional(),
});
export type DispatchItem = z.infer<typeof dispatchItemSchema>;

/** Taşıma irsaliyesi bilgileri: matbu belgenin seri/sıra no'su + taşıma ücreti. */
export const updateWaybillSchema = z.object({
  destination: upperOpt(), // GİDECEĞİ YER (belgeye basılır) — sonradan düzeltilebilir
  waybillSerial: codeOpt(), // matbu seri (ör. "A")
  waybillNo: codeOpt(), // matbu sıra no (ör. "012345")
  waybillDate: z.string().optional(), // ISO tarih
  freightAmount: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().nonnegative().optional(),
  ),
  freightVatIncluded: z.boolean().optional(),
});
export type UpdateWaybillInput = z.infer<typeof updateWaybillSchema>;

export const dispatchStopSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  customerId: z.string().nullable().optional(),
  customerLocationId: z.string().nullable().optional(),
  name: z.string(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(), // ALICI firma unvanı (belgeye bu yazılır)
  packageCount: z.number().int().default(0),
  receiptCount: z.number().int().default(0),
  itemCount: z.number().int().optional().default(0),
});
export type DispatchStop = z.infer<typeof dispatchStopSchema>;

/** Sevkiyat içindeki paletin özet görünümü. */
export const dispatchPackageSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: z.string(),
  customerName: z.string().nullable(), // GÖNDERİCİ (malın sahibi)
  receiptReference: z.string(),
  receiptId: z.string().optional(),
  waybillNo: z.string().nullable(),
  plannedVehicle: vehicleSummarySchema.nullable().optional(), // ön ihbarda planlanan araç
  // Taşıma irsaliyesi için: nereden (depo) / kime (ön ihbardaki alıcı) + durak ataması
  warehouseName: z.string().nullable().optional(),
  recipientName: z.string().nullable().optional(),
  goodsKind: z.string().nullable().optional(), // MALIN CİNSİ
  stopId: z.string().nullable().optional(),
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
  // Paletsiz (kabul düzeyi) sevkler için bağlı mal kabuller
  receipts: z
    .array(
      z.object({
        id: z.string(),
        reference: z.string(),
        customerName: z.string().nullable(),
        itemCount: z.number(),
        warehouseName: z.string().nullable().optional(),
        recipientName: z.string().nullable().optional(),
        goodsKind: z.string().nullable().optional(),
        stopId: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  // Sevkiyattaki yükün TEK kaynağı (kap + kalem satırları)
  items: z.array(dispatchItemSchema).optional().default([]),
  // Çok duraklı teslimat (rota sırasına göre)
  stops: z.array(dispatchStopSchema).optional().default([]),
  // Taşıma irsaliyesi (matbu belge bilgileri + taşıma ücreti)
  waybillSerial: z.string().nullable().optional(),
  waybillNo: z.string().nullable().optional(),
  waybillDate: z.string().nullable().optional(),
  freightAmount: z.number().nullable().optional(),
  freightVatIncluded: z.boolean().optional().default(false),
});
export type Dispatch = z.infer<typeof dispatchSchema>;

export const dispatchListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(DISPATCH_STATUSES as [DispatchStatus, ...DispatchStatus[]]).optional(),
});
export type DispatchListQuery = z.infer<typeof dispatchListQuerySchema>;
