import type { LabelExtraction } from '@lojistik/shared';

export const OCR_PROVIDER = 'OCR_PROVIDER';

/** Pluggable OCR sağlayıcı arayüzü. Faz 5: Claude vision; ileride başka sağlayıcılar eklenebilir. */
export interface OcrProvider {
  /** Etiket görselinden yapısal veri çıkarır. */
  extractLabel(image: Buffer, mimeType: string): Promise<LabelExtraction>;
}
