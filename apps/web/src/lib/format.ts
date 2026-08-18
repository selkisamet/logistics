const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateOnlyFmt = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateTime(value?: string | null): string {
  if (!value) return '–';
  return dateFmt.format(new Date(value));
}

export function formatDate(value?: string | null): string {
  if (!value) return '–';
  return dateOnlyFmt.format(new Date(value));
}

const moneyFmt = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Para biçimi (₺). null/undefined → boş dize. Ör. 12345.5 → "₺12.345,50" */
export function formatMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return moneyFmt.format(value);
}

/** Simgesiz para/tutar — matbu formun "TUTARI" gibi ₺ sütunu zaten yazılı hücreleri için. */
const amountFmt = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatAmount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return amountFmt.format(value);
}

/** Ağırlık (kg) — binlik ayraçlı, en çok 3 ondalık (0,250 kg gibi küsuratlar için). */
const weightFmt = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
export function formatWeight(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return weightFmt.format(value);
}

/** Adet/sayım: **ondalık YOK** (5 palet "5,00" olmaz), yalnız binlik ayracı: 1250 → "1.250". */
const countFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
export function formatCount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '';
  return countFmt.format(value);
}

/** Verilen tarihten bugüne kaç tam gün geçtiği. */
export function daysSince(value?: string | null): number {
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
