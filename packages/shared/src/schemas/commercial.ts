import { ShipmentStatus } from '../enums';

/**
 * Ticari sabitler — para birimi, KDV, ödeme tipi.
 *
 * Eskiden `schemas/asn.ts` içindeydi. Akış ön ihbardan mal kabule taşınınca
 * ön ihbar şemaları kaldırıldı ama bu sabitler yerinde kaldı: fiş, taşıma
 * irsaliyesi ve mal kabul ekranları hepsini kullanıyor.
 */

/** KDV oranı (%20). */
export const VAT_RATE = 0.2;

/**
 * Para birimi — satır birim fiyatları ve tesellüm fişindeki tutarlar bu cinsten.
 * Kur DÖNÜŞÜMÜ YAPILMAZ: girilen tutar hangi cinsten girildiyse belgede o cinsten
 * basılır (uygulamada kur tablosu yok; dönüşüm gerekirse muhasebe tarafında yapılır).
 * Taşıma irsaliyesindeki navlun (`Dispatch.freightAmount`) AYRI bir alandır, ₺ kalır.
 */
export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  TRY: '₺ Türk Lirası',
  USD: '$ Amerikan Doları',
  EUR: '€ Euro',
  GBP: '£ İngiliz Sterlini',
};

/** Ödeme tipi: gönderici mi alıcı mı öder. */
export const PAYMENT_TYPES = ['SENDER', 'RECIPIENT'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

/**
 * DORMANT — ön ihbar akışı kaldırıldı. `InboundShipment` tablosu eski kayıtlar
 * için duruyor, bu etiketler de onunla birlikte.
 */
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: 'Taslak',
  EXPECTED: 'Beklenen',
  IN_RECEIVING: 'Mal Kabulde',
  COMPLETED: 'Tamamlandı',
  CANCELLED: 'İptal',
};
