import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lojistik.tesellum',
  appName: 'Tesellüm & Depo',
  webDir: 'dist',
  android: {
    // Gerekirse http (LAN) backend'e izin ver; https tünelde etkisiz.
    allowMixedContent: true,
  },
};

export default config;
