/**
 * Firma (marka) bilgileri — tesellüm fişinde logo + iletişim olarak görünür.
 * Fiş aynı zamanda reklamımız: fişi gören firmalar bizi görsün.
 *
 * DEĞERLERİ BURADAN GÜNCELLE. Logo dosyası: `apps/web/public/logo.png` (şeffaf PNG ideal).
 */
export const COMPANY = {
  /** Tam yasal ünvan — fişin alt iletişim şeridinde görünür. */
  name: 'Ender Turizm Gıda İnş. Nak. Dış Tic. Ltd. Şti.',
  /** Kısa marka adı — fiş başında logonun yanında görünür. */
  shortName: 'ENDER NAKLİYAT',
  slogan: 'Depo & Lojistik Hizmetleri',
  phone: '0216 394 48 33',
  email: 'sevkiyat@endernakliyat.com',
  address: 'Anadolu Mah. Adak Sok. B1 No:1A Depo No: 14/15 Tuzla/İstanbul',
  /** E-posta alan adından çıkarıldı; yanlışsa boşalt. */
  website: 'www.endernakliyat.com',
  /** public/ altındaki logo yolu. Dosya yoksa fişte logo gizlenir (fiş yine basılır). */
  logoPath: '/logo.png',
};
