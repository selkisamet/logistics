/**
 * Domain genelinde kullanılan sabit kümeler (enum).
 * Prisma şeması ve zod şemaları bu değerlerle hizalıdır.
 */

export const UserRole = {
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  OPERATOR: 'OPERATOR',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

/** Beklenen sevkiyat (ASN / Ön İhbar) durumu */
export const ShipmentStatus = {
  DRAFT: 'DRAFT', // taslak
  EXPECTED: 'EXPECTED', // beklenen / planlandı
  IN_RECEIVING: 'IN_RECEIVING', // mal kabul başladı
  COMPLETED: 'COMPLETED', // kabul tamamlandı
  CANCELLED: 'CANCELLED', // iptal
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];
export const SHIPMENT_STATUSES = Object.values(ShipmentStatus);

/** Tesellüm (mal kabul oturumu) durumu */
export const ReceiptStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];
export const RECEIPT_STATUSES = Object.values(ReceiptStatus);

/** Fark / tutanak tipi */
export const DiscrepancyType = {
  SHORTAGE: 'SHORTAGE', // eksik
  OVERAGE: 'OVERAGE', // fazla
  DAMAGE: 'DAMAGE', // hasar
  WRONG_ITEM: 'WRONG_ITEM', // yanlış ürün
  OTHER: 'OTHER',
} as const;
export type DiscrepancyType = (typeof DiscrepancyType)[keyof typeof DiscrepancyType];
export const DISCREPANCY_TYPES = Object.values(DiscrepancyType);

/** Sevkiyat (çıkış) durumu */
export const DispatchStatus = {
  DRAFT: 'DRAFT', // hazırlanıyor
  DISPATCHED: 'DISPATCHED', // sevk edildi
  CANCELLED: 'CANCELLED',
} as const;
export type DispatchStatus = (typeof DispatchStatus)[keyof typeof DispatchStatus];
export const DISPATCH_STATUSES = Object.values(DispatchStatus);

/** Paket/birim tipi (etikette görünür). Sıra = açılır listedeki sıra. */
export const PackageType = {
  PALLET: 'PALLET', // palet
  DRUM: 'DRUM', // varil
  CARTON: 'CARTON', // koli
  CASE: 'CASE', // kasa
  BAG: 'BAG', // torba/çuval
  BIGBAG: 'BIGBAG', // big-bag
  UNIT: 'UNIT', // adet
  OTHER: 'OTHER', // diğer
} as const;
export type PackageType = (typeof PackageType)[keyof typeof PackageType];
export const PACKAGE_TYPES = Object.values(PackageType);
