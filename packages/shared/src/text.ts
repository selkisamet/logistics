import { z } from 'zod';

/**
 * Türkçe büyük harf. **Düz `toUpperCase()` KULLANMAYIN**: JS varsayılan (en) kurallarıyla
 * `'i' → 'I'` ve `'ı' → 'I'` olur; Türkçe'de doğrusu `'i' → 'İ'`, `'ı' → 'I'`.
 * "işi" → yanlış "ISI", doğru "İŞİ".
 */
export const trUpper = (s: string): string => s.toLocaleUpperCase('tr-TR');

/**
 * Kod/slug alanları için ASCII büyük harf. Bu alanlar `[A-Za-z0-9_-]` regex'iyle
 * kısıtlı olduğu için Türkçe büyük harf (İ) regex'i ihlal eder → düz `toUpperCase()`.
 */
export const asciiUpper = (s: string): string => s.toUpperCase();

/**
 * Serbest metin alanları **kayıt anında** BÜYÜK HARFE normalize edilir: aynı firmayı
 * kimi kullanıcı "arkem kimya", kimi "Arkem Kimya" yazıyordu; belgelerde ve listelerde
 * tutarsız görünüyordu. Tek huni: `ZodValidationPipe` `schema.parse()` sonucunu döndürdüğü
 * için buradaki `transform` TÜM yazma yollarını kapsar (web formu da aynı şemayı kullanır).
 *
 * Uygulanmayan alanlar (bilinçli): e-posta (küçük harf teamülü + `.email()` doğrulaması),
 * şifre, telefon/vergi no (rakam), arama metni (aramayı bozardı), id'ler.
 */
export const upperStr = (base: z.ZodString = z.string()) =>
  base.transform((v) => trUpper(v.trim()));

/** `upperStr`'in opsiyonel hâli — boş/undefined ise dokunmaz. */
export const upperOpt = (base: z.ZodString = z.string()) =>
  base.optional().transform((v) => (v === undefined ? undefined : trUpper(v.trim())));

/** Kod/slug alanı (ASCII, regex kısıtlı) — bkz. `asciiUpper`. */
export const codeOpt = (base: z.ZodString = z.string()) =>
  base.optional().transform((v) => (v === undefined ? undefined : asciiUpper(v.trim())));
