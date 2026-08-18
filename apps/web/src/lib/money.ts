/**
 * Para girişi maskesi — TSE/tr-TR biçimi: binlik `.`, ondalık `,` (1.250,50).
 *
 * Neden maske: `<input type="number">` binlik ayracı GÖSTEREMEZ (HTML standardı; değer
 * daima `1250.5` gibi ham durur). Plaka/telefon alanlarındaki desenin aynısı — metin
 * input + biçimlendirme, dışarıya SAYI verilir.
 */

/** Yazarken biçimlendirir. Yarım girdiyi bozmaz: "1250," yazarken virgül korunur. */
export function formatMoneyInput(raw: string): string {
  const s = (raw ?? '').replace(/[^\d,]/g, ''); // rakam ve virgül dışını at
  if (!s) return '';

  // Yalnızca İLK virgül ondalık ayracıdır; sonrakiler yok sayılır.
  const i = s.indexOf(',');
  const intRaw = (i === -1 ? s : s.slice(0, i)).replace(/^0+(?=\d)/, ''); // baştaki sıfırları at
  const dec = i === -1 ? null : s.slice(i + 1).replace(/,/g, '').slice(0, 2); // en çok 2 hane

  const int = (intRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec === null ? int : `${int},${dec}`;
}

/** Maskeli metni sayıya çevirir. Boş/geçersiz → undefined (şema `.optional()` bekliyor). */
export function parseMoneyInput(text: string): number | undefined {
  const s = (text ?? '').replace(/\./g, '').replace(',', '.');
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Sayıyı input'ta gösterilecek metne çevirir (düzenleme ekranında ön-doldurma). */
export function moneyToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '';
  // Kuruş varsa iki haneye tamamla (1250.5 → "1.250,50"); yoksa tam sayı bırak
  // ("1.500" — kaydedilmiş yuvarlak tutarda ",00" gereksiz gürültü).
  // NOT: yazarken bu kullanılmaz; orada `formatMoneyInput` yarım girdiyi olduğu gibi korur.
  const [int, dec] = String(n).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec ? `${grouped},${dec.slice(0, 2).padEnd(2, '0')}` : grouped;
}
