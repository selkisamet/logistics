import { clsx } from 'clsx';

/**
 * Matbu belgelerdeki "ETİKET : değer" satırları.
 *
 * Ortak kural: matbu (önceden basılı) formda geometri VERİYE BAĞLI OLMAMALI.
 * Bir alan sarsaydı altındakileri aşağı iter, kağıttaki basılı kutularla hizalama kayardı.
 * Bu yüzden değer alanları sabit yükseklikli ve taşan metin kırpılır.
 */

/** Başlıktaki "ETİKET : değer" satırı (noktalı doldurma çizgili). Tek satır sabit. */
export function MetaLine({
  label,
  value,
  labelWidth = 118,
}: {
  label: string;
  value: string;
  labelWidth?: number;
}) {
  return (
    <div className="flex gap-1 text-[9px] leading-[1.3]">
      <span
        style={{ width: `${labelWidth}px` }}
        className="shrink-0 text-right font-bold text-slate-700"
      >
        {label}
      </span>
      <span className="text-slate-400">:</span>
      <span className="slip-data h-[1.3em] flex-1 overflow-hidden whitespace-nowrap border-b border-dotted border-slate-400 font-semibold text-slate-900">
        {value || ' '}
      </span>
    </div>
  );
}

/** Taraf (Gönderen/Alıcı/Taşıyıcı) bloğundaki "ETİKET : değer" satırı.
 *  `lines`: kaç satırlık SABİT yükseklik ayrılacağı.
 *  `auto`: yalnızca bloğun EN SON alanı için — altında itilecek bir şey olmadığından
 *  serbestçe sarabilir (uzun adres kırpılmasın diye). */
export function FieldLine({
  label,
  value,
  lines = 1,
  auto = false,
  labelWidth = 66,
}: {
  label: string;
  value: string;
  lines?: number;
  auto?: boolean;
  labelWidth?: number;
}) {
  return (
    <div className="mb-1 flex gap-1 text-[9px] leading-[1.3]">
      <span style={{ width: `${labelWidth}px` }} className="shrink-0 font-semibold text-slate-600">
        {label}
      </span>
      <span className="text-slate-400">:</span>
      <span
        style={auto ? undefined : { height: `${lines * 1.3}em` }}
        className={clsx(
          'slip-data flex-1 border-b border-dotted border-slate-400 text-slate-900',
          !auto && 'overflow-hidden',
        )}
      >
        {value || ' '}
      </span>
    </div>
  );
}
