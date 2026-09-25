import { z } from 'zod';
import {
  RECEIPT_STATUSES,
  ReceiptStatus,
  PACKAGE_TYPES,
  PackageType,
  DISCREPANCY_TYPES,
  DiscrepancyType,
} from '../enums';
import { paginationQuerySchema } from './common';
import { discrepancySchema, attachmentSchema } from './discrepancy';
import { vehicleSummarySchema } from './vehicle';
import { CURRENCIES } from './commercial';
import { upperStr, upperOpt, codeOpt } from '../text';

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
  IBC: 'IBC',
  UNIT: 'Adet',
  OTHER: 'Diğer',
};

/** Kalem satırının NEVİ (kap) seçenekleri — irsaliyedeki NEVİ sütununa basılır.
 *  TEK kaynak: QR palet tipleriyle aynı liste, böylece iki yer ayrışmaz.
 *  `ReceiptLine.unit` serbest metin olduğu için etiketler doğrudan saklanır. */
export const KAP_TYPES = Object.values(PACKAGE_TYPE_LABELS);

/**
 * Yükleme yeri: göndericinin lokasyonu, BİZİM depomuz ya da serbest metin.
 * Yük her zaman müşteriden alınmıyor; bazı seferlerde kendi depomuzdan yükleniyor.
 */
export const receiptSourceInputSchema = z
  .object({
    customerLocationId: z.string().optional(),
    warehouseId: z.string().optional(),
    label: upperStr(z.string().min(1, 'Yükleme yeri gerekli')),
  })
  // İkisi birden gelirse etiket/adresin hangi kayıttan sabitleneceği belirsiz kalır
  .refine((s) => !(s.customerLocationId && s.warehouseId), {
    message: 'Yükleme yeri ya müşteri lokasyonu ya da kendi depomuz olabilir',
    path: ['warehouseId'],
  });
export type ReceiptSourceInput = z.infer<typeof receiptSourceInputSchema>;

/** Boşaltma yeri: alıcı müşterinin lokasyonu ya da serbest metin. */
export const receiptRecipientInputSchema = z.object({
  customerLocationId: z.string().optional(),
  label: upperStr(z.string().min(1, 'Boşaltma yeri gerekli')),
});
export type ReceiptRecipientInput = z.infer<typeof receiptRecipientInputSchema>;

/**
 * Mal kabul başlatma — uygulamanın GİRİŞ NOKTASI.
 *
 * Akış ön ihbarla değil burada başlar: araç depoya gelir, irsaliyesini getirir,
 * depocu kontrol edip malı indirir. Malın geleceği çoğu zaman önceden bilinmiyor.
 *
 * Depocu yalnız BİLDİĞİ şeyi girer. ALICI **opsiyoneldir** — gelen irsaliyede
 * nihai firma her zaman yazmıyor; ofis sonradan tamamlar.
 *
 * İrsaliye ve sipariş no'yu depocu YAZMAZ: irsaliye fotoğrafı çekilince OCR
 * okur ve alanlar kendiliğinden dolar (yanlış okursa elle düzeltilebilir).
 *
 * Burada olmayanlar bilinçli: **yükleme yerini** depocu bilmez ve ticari
 * alanlar (para birimi, ödeme tipi, termin...) ofisin işi — ikisi de
 * `updateReceiptCommercialSchema` ile girilir.
 */
export const startReceiptSchema = z.object({
  customerId: z.string().min(1, 'Gönderici seçilmeli'),
  warehouseId: z.string().min(1, 'Hedef depo seçilmeli'),
  recipientCustomerId: z.string().optional(), // ALICI — depocu bilmiyorsa boş
  waybillNo: codeOpt(), // göndericinin sevk irsaliye no'su — fotoğraftan okunur
  orderNo: codeOpt(), // sipariş no — aynı fotoğraftan okunur, fişe basılır
  notes: upperOpt(),

  /**
   * Gelen yük — "5 palet ham madde, 3 varil boya". Kayıtla AYNI transaction'da
   * işlenir; tarayıcıdan arka arkaya istek zincirlemek yarım kalmış kayıt
   * üretiyordu (kayıt açılır, kalem açılmaz).
   */
  kap: z
    .object({
      items: z
        .array(
          z.object({
            /** Kap tipi ETİKETİ (Palet/Varil…) — `KAP_TYPES` değerlerinden. */
            type: z.string().min(1),
            count: z.coerce.number().int().positive(),
            /** Malın cinsi; boşsa kap adı kullanılır (depocu sonradan düzeltir). */
            description: upperOpt(),
          }),
        )
        .min(1),
      /**
       * true → her kap için benzersiz QR etiketi (kap bazlı sevk),
       * false → satır başına bir kalem (kalem bazlı sevk).
       *
       * Satır başına DEĞİL kayıt başına bir karar: tek-granülerlik kuralı gereği
       * bir kabul ya kap ya kalem bazlıdır, karışığı çift sayım yapar ve sevkte
       * reddedilir.
       */
      makeLabels: z.boolean().optional().default(false),
    })
    .optional(),

  /** Teslim alırken görülen hasar/eksik — aracı bekletmeden yazılsın. */
  discrepancy: z
    .object({
      type: z.enum(DISCREPANCY_TYPES as [DiscrepancyType, ...DiscrepancyType[]]),
      description: upperStr(z.string().min(1, 'Tutanak açıklaması gerekli')),
    })
    .optional(),
});
export type StartReceiptInput = z.infer<typeof startReceiptSchema>;

/** Tek bir satırın (ürünün) sayım kaydı/güncellemesi. */
export const upsertReceiptLineSchema = z.object({
  lineId: z.string().optional(), // mevcut satırı id ile güncelle (en güvenilir eşleşme)
  sku: upperStr().default(''), // ürün kodu (çoğu sevkiyatta yok)
  description: upperStr(z.string().min(1, 'Açıklama gerekli')),
  countedQty: z.coerce.number().int().min(0),
  unit: z.string().default('ADET'),
  barcode: z.string().optional(),
  // Birim fiyat — ön ihbarda kalem girilmediyse fiyatın girilebileceği TEK yer burasıdır
  // (fişteki ÜCRET sütunu ve Ara/KDV/Genel Toplam bundan hesaplanır).
  unitPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().nonnegative('Fiyat negatif olamaz').optional(),
  ),
  // kalemin toplam ağırlığı (kg) — boş input '' → undefined
  weightKg: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().nonnegative('Ağırlık negatif olamaz').optional(),
  ),
  asnLineId: z.string().optional(), // beklenen satırla eşleşme
});
export type UpsertReceiptLineInput = z.infer<typeof upsertReceiptLineSchema>;

/** Koli/palet etiketi (QR) oluşturma. */
export const createPackageSchema = z.object({
  type: z.enum(PACKAGE_TYPES as [PackageType, ...PackageType[]]).default(PackageType.CARTON),
  count: z.coerce.number().int().min(1).max(500).default(1), // kaç adet benzersiz etiket
  sku: upperOpt(),
  qty: z.coerce.number().int().positive().optional(),
  note: upperOpt(),
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
  unitPrice: z.number().nonnegative().nullable().optional(), // birim fiyat (ön ihbardan)
  weightKg: z.number().nonnegative().nullable().optional(), // ağırlık kg (ön ihbardan)
  // Kalem bazlı sevk: araca yüklenen ve depoda kalan miktar
  dispatchedQty: z.number().int().optional().default(0),
  remainingQty: z.number().int().optional().default(0),
});
export type ReceiptLine = z.infer<typeof receiptLineSchema>;

export const receiptSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: z.enum(RECEIPT_STATUSES as [ReceiptStatus, ...ReceiptStatus[]]),
  // DORMANT: ön ihbar akışı kaldırıldı; yeni kabullerde null. Eski kayıtlarda dolu.
  asnId: z.string().nullable(),
  asnReference: z.string().nullable().optional(),
  plannedVehicleId: z.string().nullable().optional(),
  plannedVehicle: vehicleSummarySchema.nullable().optional(), // "bu yük şu araca gidecek"
  recipientCustomerId: z.string().nullable().optional(), // ALICI (ofis doldurur)
  customerId: z.string(),
  customer: z
    .object({
      id: z.string(),
      name: z.string(),
      legalName: z.string().nullable().optional(), // belgelerde basılan tam ünvan
      code: z.string(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      taxOffice: z.string().nullable().optional(),
      taxNumber: z.string().nullable().optional(),
    })
    .optional(),
  warehouseId: z.string(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
  notes: z.string().nullable(),
  waybillNo: z.string().nullable().optional(),
  orderNo: z.string().nullable().optional(),
  // Ön ihbardaki termin — kopyalanmaz, serializeReceipt yüzeye çıkarır (tek kaynak shipment)
  deliveryBy: z.string().nullable().optional(),
  dispatchId: z.string().nullable().optional(),
  dispatchedAt: z.string().nullable().optional(),
  // Ön ihbardan taşınan taraf/adres/ödeme bilgileri (fiş için)
  loadAddress: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  paymentType: z.enum(['SENDER', 'RECIPIENT']).nullable().optional(),
  showAmountOnSlip: z.boolean().optional().default(false),
  vatIncluded: z.boolean().optional().default(false),
  // Para birimi — kopyalanmaz, serializeReceipt ön ihbardan yüzeye çıkarır (tek kaynak shipment)
  currency: z.enum(CURRENCIES).optional().default('TRY'),
  // Alıcı = kayıtlı müşteri (fişte ALICI ünvanı)
  recipientCustomer: z
    .object({
      id: z.string(),
      name: z.string(),
      legalName: z.string().nullable().optional(), // belgelerde basılan tam ünvan
      code: z.string(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      taxOffice: z.string().nullable().optional(),
      taxNumber: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  // Yükleme (kaynak) ve boşaltma (alıcı) noktaları — fişte ayrı ayrı listelenir.
  // id/customerLocationId/warehouseId ofis düzenleme formu seçimi geri kurabilsin diye.
  sources: z
    .array(
      z.object({
        id: z.string().optional(),
        customerLocationId: z.string().nullable().optional(),
        warehouseId: z.string().nullable().optional(),
        label: z.string(),
        address: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  recipients: z
    .array(
      z.object({
        id: z.string().optional(),
        customerLocationId: z.string().nullable().optional(),
        label: z.string(),
        address: z.string().nullable().optional(),
      }),
    )
    .optional()
    .default([]),
  lines: z.array(receiptLineSchema),
  packages: z.array(packageSchema).optional(),
  discrepancies: z.array(discrepancySchema).optional(),
  // İrsaliye/belge görüntüleri (foto) — doğrudan mal kabule bağlı
  attachments: z.array(attachmentSchema).optional().default([]),
  startedById: z.string().nullable(),
  /** Malı teslim alan depocu — geriye dönük "kim kabul etti" sorusu için. */
  startedBy: z.object({ id: z.string(), fullName: z.string() }).nullable().optional(),
  /**
   * Bu kabulün yükü hangi sefer(ler)le çıktı.
   * Kaynak `DispatchItem` defteri; `Receipt.dispatchId` DORMANT olduğu için
   * oradan okunamaz. Aynı kabulün birden çok kalemi tek sefere gidebildiğinden
   * sunucuda TEKİLLEŞTİRİLİR.
   */
  dispatches: z
    .array(
      z.object({
        id: z.string(),
        reference: z.string(),
        status: z.string(),
        dispatchedAt: z.string().nullable(),
        plate: z.string().nullable(),
      }),
    )
    .optional()
    .default([]),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type Receipt = z.infer<typeof receiptSchema>;

/** Mal kabul bilgilerini güncelleme (irsaliye no / sipariş no / notlar). */
export const updateReceiptSchema = z.object({
  waybillNo: codeOpt(),
  orderNo: codeOpt(),
  notes: upperOpt(),
});
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;

/**
 * Ticari/taraf bilgileri — OFİS doldurur (yönetici/şef), depocu değil.
 * Ayrı bir uçta duruyor çünkü `PATCH /receipts/:id` her oturum açmış kullanıcıya
 * açık; bu alanlar eskiden ön ihbardaydı ve ön ihbar rotaları admin/şef'ti.
 * Hepsi opsiyonel: yalnız gönderilen alan güncellenir.
 */
/**
 * Kalemin TİCARİ alanlarını düzenler — OFİS doldurur (yönetici/şef).
 *
 * Depocu malı indirirken fiyatı bilmiyor; yalnızca cins ve adet giriyor.
 * Fiyat sonradan buradan yazılır ve mal kabul TAMAMLANDIKTAN SONRA da
 * yazılabilir (fişteki ÜCRET sütunu ve KDV hesabı bundan besleniyor).
 *
 * **`countedQty` BİLEREK YOK.** Adet stok defterinin kendisi: sevk edilmiş bir
 * kabulde değişirse `dispatchedQty` sayacı bozulur, kalan negatife düşer.
 * Adet düzeltmesi "Geri Aç"tan geçer — o da sevk edilmiş kaydı reddediyor.
 *
 * `undefined` = dokunma, `null` = temizle.
 */
export const editReceiptLineSchema = z.object({
  description: upperOpt(),
  unit: z.string().optional(),
  unitPrice: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v === null ? null : v),
    z.coerce.number().nonnegative('Fiyat negatif olamaz').nullable().optional(),
  ),
  weightKg: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v === null ? null : v),
    z.coerce.number().nonnegative('Ağırlık negatif olamaz').nullable().optional(),
  ),
});
export type EditReceiptLineInput = z.infer<typeof editReceiptLineSchema>;

export const updateReceiptCommercialSchema = z.object({
  recipientCustomerId: z.string().nullable().optional(), // null = alıcıyı kaldır
  plannedVehicleId: z.string().nullable().optional(),
  deliveryBy: z.string().nullable().optional(), // ISO tarih — SON TESLİM (termin)
  currency: z.enum(CURRENCIES).optional(),
  paymentType: z.enum(['SENDER', 'RECIPIENT']).nullable().optional(),
  showAmountOnSlip: z.boolean().optional(),
  vatIncluded: z.boolean().optional(),
  sources: z.array(receiptSourceInputSchema).optional(), // verilirse hepsi değişir
  recipients: z.array(receiptRecipientInputSchema).optional(),
});
export type UpdateReceiptCommercialInput = z.infer<typeof updateReceiptCommercialSchema>;

export const receiptListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(RECEIPT_STATUSES as [ReceiptStatus, ...ReceiptStatus[]]).optional(),
  // Geriye dönük sorgulama: teslim alma tarihine (startedAt) göre aralık.
  // paginationQuerySchema'ya eklenmedi — müşteri/araç listelerinde anlamsız.
  from: z.string().optional(), // ISO tarih (gün başı)
  to: z.string().optional(), // ISO tarih (gün sonu dahil)
});
export type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>;
