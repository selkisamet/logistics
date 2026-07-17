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
  website: 'www.enderlojistik.com',
  /** Şubeler — fişin alt iletişim şeridinde yan yana görünür. */
  branches: [
    {
      name: 'Tuzla',
      address: 'Anadolu Mah. Adak Sok. B1 No:1A Depo No: 14/15 Tuzla/İstanbul',
      phone: '0216 394 48 33',
      email: 'sevkiyat@endernakliyat.com.tr',
    },
    {
      name: 'Çorlu',
      address: 'Silver Trade Center, Cumhuriyet, Bülent Ecevit Blv. D:2.etap A2/15, 59860 Çorlu/Tekirdağ',
      phone: '0546 476 78 56',
      email: 'corlusube@endernakliyat.com.tr',
    },
  ],
  /** public/ altındaki logo yolu. Dosya yoksa fişte logo gizlenir (fiş yine basılır). */
  logoPath: '/logo.png',
  /** Yetki belgeleri — fişte logo altında rozet olarak (kod). Numaralar kayıtta durur, gerekirse gösterilir. */
  docs: [
    { code: 'K1', no: 'İST.U-NET.K1.34.139419' },
    { code: 'H1', no: 'İST.U-NET.H1.34.868' },
    { code: 'ADR', no: 'İST.U-NET.TMFB.34.39892' },
    { code: 'TİO', no: 'İST.U-NET.TİO.34.2471' },
  ],
};
