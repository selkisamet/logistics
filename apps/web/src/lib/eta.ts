/**
 * Araç görevlerinin tahmini depoya geliş zamanı — gün (YYYY-MM-DD) + opsiyonel saat.
 * Gün YEREL saate göre hesaplanır: toISOString() UTC verir, gece yarısına yakın
 * saatlerde "bugün"ü bir gün kaydırırdı.
 */

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** Yerel tarih → "YYYY-MM-DD". `offset` gün ekler (1 = yarın). */
export function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type EtaTone = 'late' | 'today' | 'later' | 'none';

/** "Bugün 14:30", "Yarın", "12.10 Pzt", "Gecikti · 08.10" — ve renk tonu. */
export function etaLabel(date: string | null, time: string | null): { text: string; tone: EtaTone } {
  if (!date) return { text: 'Geliş belirsiz', tone: 'none' };
  const today = localDay(0);
  const t = time ? ` ${time}` : '';
  const [y, m, d] = date.split('-');
  const short = `${d}.${m}`;

  if (date < today) return { text: `Gecikti · ${short}${t}`, tone: 'late' };
  if (date === today) {
    // Saati geçtiyse hâlâ "bugün" ama gecikmiş — depocu/yönetici fark etsin
    if (time && time < nowHHMM()) return { text: `Bugün${t} · gecikti`, tone: 'late' };
    return { text: `Bugün${t}`, tone: 'today' };
  }
  if (date === localDay(1)) return { text: `Yarın${t}`, tone: 'later' };
  const wd = WEEKDAYS[new Date(Number(y), Number(m) - 1, Number(d)).getDay()];
  return { text: `${short} ${wd}${t}`, tone: 'later' };
}

export const ETA_TONE_CLASS: Record<EtaTone, string> = {
  late: 'bg-red-100 text-red-700',
  today: 'bg-emerald-100 text-emerald-800',
  later: 'bg-slate-100 text-slate-700',
  none: 'bg-slate-100 text-slate-400',
};
