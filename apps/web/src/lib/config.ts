/**
 * Çalışma zamanında ayarlanabilir sunucu (API) adresi.
 *
 * Tarayıcıda: varsayılan boş = aynı köken (Vite proxy /api). Değiştirilmez gerekmez.
 * Native uygulamada (APK): web varlıkları cihazda gömülü olduğundan aynı-köken yoktur;
 * kullanıcı backend adresini (tünel ya da kalıcı adres) bir kez girer, burada saklanır.
 */

const KEY = 'lojistik-server-url';
const DEFAULT_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Capacitor native kabuğu içinde mi çalışıyoruz? */
export function isNativeApp(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** API taban adresi. Boş string = aynı köken (relative /api). */
export function getApiBase(): string {
  const stored = localStorage.getItem(KEY);
  if (stored !== null) return stored.replace(/\/$/, '');
  return DEFAULT_BASE;
}

export function setApiBase(url: string): void {
  localStorage.setItem(KEY, url.trim().replace(/\/$/, ''));
}

/**
 * Sunucu adresi alanı gösterilmeli mi?
 * Uzak (http/https) origin'den yüklendiyse (server.url ile canlı yükleme) aynı-köken /api
 * çalışır → alan gerekmez. Yalnızca gömülü varlıklarda (capacitor://localhost / file://) ya da
 * kullanıcı elle ayarladıysa göster.
 */
export function serverUrlConfigurable(): boolean {
  const httpOrigin = location.protocol === 'http:' || location.protocol === 'https:';
  if (httpOrigin) return localStorage.getItem(KEY) !== null;
  return true;
}
