/**
 * Firma (marka) bilgileri — tesellüm fişinde logo + iletişim olarak görünür.
 * Fiş aynı zamanda reklamımız: fişi gören firmalar bizi görsün.
 *
 * DEĞERLERİ BURADAN GÜNCELLE. Logo dosyasını `apps/web/public/logo.png` olarak koy
 * (şeffaf PNG ideal). SVG kullanacaksan logoPath'i '/logo.svg' yap.
 */
export const COMPANY = {
  name: 'FİRMA ADI',
  slogan: '3PL Depo & Lojistik',
  phone: '0262 000 00 00',
  email: 'info@firma.com',
  address: 'Adres, İlçe / İl',
  website: 'www.firma.com',
  /** public/ altındaki logo yolu. Dosya yoksa fişte logo gizlenir (fiş yine basılır). */
  logoPath: '/logo.png',
};
