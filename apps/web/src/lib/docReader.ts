import { Capacitor, registerPlugin } from '@capacitor/core';
import { BrowserQRCodeReader } from '@zxing/browser';
import { OCR_PROFILE, toUprightJpeg } from './image';
import { analyzeWaybill, type ScanLine, type WaybillScan } from './waybillScan';

/**
 * İrsaliye fotoğrafını TELEFONDA okur — sunucuya / yapay zekâya gitmez, ücretsiz.
 *
 * - **APK (yeni sürüm):** native `DocReader` eklentisi (Google ML Kit, cihaz üzerinde)
 *   → QR + basılı metin. Kaynak: android/.../DocReaderPlugin.java
 * - **Tarayıcı / eklentisiz eski APK:** yalnız QR (zxing). Metin okunamaz → elle yazılır.
 *
 * Web uygulaması APK'ya sunucudan canlı yüklendiği için eski APK da bu kodu çalıştırır;
 * eklenti yoksa sessizce QR'a düşer, hata vermez.
 */

type ReadResult = { barcodes?: string[]; lines?: ScanLine[] };

const DocReader = registerPlugin<{ read(options: { data: string }): Promise<ReadResult> }>(
  'DocReader',
);

/** Telefonda metin okuma (ML Kit) var mı? */
export function canReadText(): boolean {
  return Capacitor.isPluginAvailable('DocReader');
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('Görsel okunamadı'));
    r.readAsDataURL(blob);
  });
}

async function readQrInBrowser(img: Blob): Promise<string | null> {
  const url = URL.createObjectURL(img);
  try {
    const res = await new BrowserQRCodeReader().decodeFromImageUrl(url);
    return res.getText();
  } catch {
    return null; // QR yok ya da çözülemedi
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Fotoğraftan QR + aday numaraları çıkarır. */
export async function scanWaybill(file: File): Promise<WaybillScan> {
  const img = await toUprightJpeg(file, OCR_PROFILE);

  if (canReadText()) {
    try {
      const r = await DocReader.read({ data: await toBase64(img) });
      return analyzeWaybill(r.barcodes ?? [], r.lines ?? []);
    } catch {
      /* native okuma düştü — en azından QR'ı tarayıcıda dene */
    }
  }

  const qr = await readQrInBrowser(img);
  return analyzeWaybill(qr ? [qr] : [], []);
}
