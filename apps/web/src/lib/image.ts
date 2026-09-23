/**
 * Yüklemeden ÖNCE görseli küçültüp yeniden kodlar.
 *
 * Neden istemci tarafında: depo telefonları mobil veri/tünel üzerinden çalışıyor ve
 * 12 MP kamera fotoğrafı 4-6 MB geliyor; bir mal kabulde 12 tane olabiliyor. Sunucuda
 * sıkıştırmak dosyanın tamamının yine de yüklenmesi demekti.
 *
 * Kalite ölçüsü: A4 irsaliye 2000 px uzun kenarda ~170 DPI eder — kaşe ve el yazısı
 * dahil okunur. JPEG %82 bu boyutta gözle ayırt edilir bir kayıp vermez.
 */

export type CompressProfile = {
  /** Uzun kenarın üst sınırı (px). Görsel zaten küçükse büyütülmez. */
  maxEdge: number;
  /** JPEG kalitesi (0-1). */
  quality: number;
};

/** Saklanan belge fotoğrafları (irsaliye, tutanak) — arşivde okunur kalmalı. */
export const ATTACHMENT_PROFILE: CompressProfile = { maxEdge: 2000, quality: 0.82 };

/**
 * OCR'a giden kare. Claude görme API'si gelen görseli zaten uzun kenarı ~1500 px
 * olacak şekilde küçülttüğü için daha büyüğünü göndermek yalnızca bekleme süresi
 * ekler; bu profil doğruluğu düşürmez, okumayı hızlandırır.
 */
export const OCR_PROFILE: CompressProfile = { maxEdge: 2000, quality: 0.9 };

/** Yeniden kodlamanın anlamlı olmadığı türler: animasyon kaybolur, vektör bozulur. */
const SKIP_TYPES = ['image/gif', 'image/svg+xml', 'image/heif-sequence'];

/**
 * Görseli çözer. `createImageBitmap` tercih edilir çünkü `imageOrientation` ile
 * EXIF dönüşünü uygular — aksi halde telefonla dikey çekilen fotoğraf canvas'a
 * yatık düşer (kamera dosyaya "90° çevir" etiketi yazar, pikselleri çevirmez).
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* eski tarayıcı / desteklenmeyen tür — <img> yedeğine düş */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel çözülemedi'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Uzantıyı .jpg yapar — dosya artık JPEG, sunucu adı uzantıdan türetiyor. */
function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`;
}

/**
 * Tek görseli sıkıştırır. **Hiçbir koşulda yüklemeyi engellemez:** sıkıştırma
 * başarısız olursa ya da sonuç orijinalden büyük çıkarsa orijinal dosya döner
 * (zaten küçük veya taranmış görseller boşuna bozulmasın).
 */
export async function compressImage(
  file: File,
  profile: CompressProfile = ATTACHMENT_PROFILE,
): Promise<File> {
  if (!file.type.startsWith('image/') || SKIP_TYPES.includes(file.type)) return file;

  try {
    const src = await decode(file);
    const w = 'width' in src ? src.width : 0;
    const h = 'height' in src ? src.height : 0;
    if (!w || !h) return file;

    // Küçültme oranı; görsel zaten sınırın altındaysa 1 (büyütme YOK, yalnız yeniden kodlama)
    const scale = Math.min(1, profile.maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Saydam PNG JPEG'e dönünce zemin siyah kalırdı — önce beyaza boya
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ('close' in src) src.close();

    const blob = await toBlob(canvas, profile.quality);
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], jpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/** Birden çok görseli sırayla sıkıştırır (paralel yapmak telefonda belleği zorluyor). */
export async function compressImages(
  files: File[],
  profile: CompressProfile = ATTACHMENT_PROFILE,
): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) out.push(await compressImage(f, profile));
  return out;
}
