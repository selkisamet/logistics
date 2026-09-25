import { useEffect, useState } from 'react';
import { Input } from './ui';

export type ListFilters = { from: string; to: string; search: string };

/**
 * Liste sayfalarının tarih aralığı + arama çubuğu.
 *
 * Geriye dönük sorgulama için: "şu tarihte depoya ne girdi / hangi sefer
 * çıktı". Mal Kabul ve Sevkiyat listeleri aynı çubuğu kullanır.
 *
 * Arama GECİKMELİ yayınlanır — her tuş vuruşunda istek atmak, listeyi
 * sunucudan çeken bir ekranda gereksiz yük.
 */
export function ListFilterBar({
  value,
  onChange,
}: {
  value: ListFilters;
  onChange: (v: ListFilters) => void;
}) {
  const [text, setText] = useState(value.search);

  useEffect(() => {
    if (text === value.search) return;
    const t = setTimeout(() => onChange({ ...value, search: text }), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);

  const hasFilter = value.from || value.to || value.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ara (referans, müşteri, irsaliye no…)"
        className="min-w-[12rem] flex-1"
      />
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="w-[9.5rem]"
        />
        <span className="text-slate-400">–</span>
        <Input
          type="date"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="w-[9.5rem]"
        />
      </div>
      {hasFilter && (
        <button
          onClick={() => {
            setText('');
            onChange({ from: '', to: '', search: '' });
          }}
          className="text-sm font-medium text-brand"
        >
          Temizle
        </button>
      )}
    </div>
  );
}

/** Filtreleri sorgu parametrelerine ekler (boş olanlar gönderilmez). */
export function applyFilters(params: URLSearchParams, f: ListFilters) {
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.search.trim()) params.set('search', f.search.trim());
  return params;
}
