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

/** Verilen tarihten bugüne kaç tam gün geçtiği. */
export function daysSince(value?: string | null): number {
  if (!value) return 0;
  const diff = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}
