import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lojistik.tesellum',
  appName: 'Tesellüm & Depo',
  webDir: 'dist',
  // Canlı yükleme: APK, web'i buluttaki adresten yükler → web değişince APK'yı
  // yeniden kurmaya gerek yok. Native eklentiler (kamera) yine çalışır.
  server: {
    url: 'https://logistics-86zh.onrender.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
