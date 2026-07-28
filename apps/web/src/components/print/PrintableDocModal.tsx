import { useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { useReactToPrint } from 'react-to-print';
import { Button } from '../ui';

/**
 * Matbu (önceden basılı) belgeler için ortak yazdırma kabuğu.
 * Tesellüm Fişi ve Taşıma İrsaliyesi bunu paylaşır — böylece `pageStyle`'daki
 * ince ayarlar (özellikle `body * { visibility: visible }`) tek yerde kalır.
 *
 * 3 mod, tek DOM (geometri hep aynı → matbu forma hizalama bozulmaz):
 *  - `full`  : boş kağıda tam belge
 *  - `data`  : matbu forma YALNIZ veri (çerçeve/etiketler saydam) — dot-matrix günlük baskı
 *  - `blank` : matbaaya verilecek boş form master (veriler + QR gizli)
 * Sınıf eşlemesi `.slip-hide-chrome` / `.slip-hide-data` → apps/web/src/index.css
 */
export type PrintMode = 'full' | 'data' | 'blank';

const PRINT_MODES: { key: PrintMode; label: string }[] = [
  { key: 'full', label: 'Boş kağıda tam' },
  { key: 'data', label: 'Matbu forma (yalnız veri)' },
  { key: 'blank', label: 'Boş form (matbaa master)' },
];

export type CopyOption = { key: string; label: string; badge: string };

export function PrintableDocModal({
  title,
  documentTitle,
  pageSize,
  previewWidth = '210mm',
  copies,
  blankHint,
  overflowWarning,
  onClose,
  children,
}: {
  title: string;
  documentTitle: string;
  pageSize: 'A5 landscape' | 'A4 portrait';
  /** Ekran önizleme genişliği; baskıda pageStyle bunu %100'e çeker. */
  previewWidth?: string;
  /** Nüsha seçenekleri (karbonlu koçan). Boş bırakılırsa seçici gösterilmez. */
  copies?: CopyOption[];
  /** `blank` modunda gösterilecek matbaa talimatı. */
  blankHint?: ReactNode;
  /** `data` modunda gösterilecek kapasite/taşma uyarısı. */
  overflowWarning?: ReactNode;
  onClose: () => void;
  children: (ctx: { mode: PrintMode; copyBadge: string; blank: boolean }) => ReactNode;
}) {
  const [mode, setMode] = useState<PrintMode>('full');
  const [copy, setCopy] = useState<string>(copies?.[0]?.key ?? 'none');
  const copyBadge = copies?.find((c) => c.key === copy)?.badge ?? '';
  const printRef = useRef<HTMLDivElement>(null);

  // Baskı izole bir iframe'de yapılır (react-to-print) → sayfalama düzgün, kırpılma yok.
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle,
    pageStyle: `
      @page { size: ${pageSize}; margin: 5mm; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body * { visibility: visible !important; }
      .slip-doc { width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
    `,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      {/* Araç çubuğu — yazdırmada gizli */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-4">
        <span className="font-semibold text-slate-900">{title}</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {PRINT_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  mode === m.key ? 'bg-white text-brand shadow-sm' : 'text-slate-500',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {copies && copies.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <span className="pl-1 pr-0.5 text-[10px] font-semibold uppercase text-slate-400">
                Nüsha
              </span>
              {copies.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCopy(c.key)}
                  className={clsx(
                    'rounded-md px-2 py-1 text-xs font-medium transition',
                    copy === c.key ? 'bg-white text-brand shadow-sm' : 'text-slate-500',
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Button onClick={() => handlePrint()}>🖨️ Yazdır</Button>
        </div>
      </div>

      {mode !== 'full' && (
        <div className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          {mode === 'data'
            ? 'Yalnız veriler basılır — matbu (önceden basılı) forma yerleştirmek için. Çizgi/etiketler basılmaz.'
            : 'Yalnız boş form basılır — matbaaya bu master ile bastırın. Veriler görünmez.'}
        </div>
      )}
      {mode === 'blank' && blankHint && (
        <div className="bg-emerald-50 px-4 py-1.5 text-xs text-emerald-800">{blankHint}</div>
      )}
      {mode === 'data' && overflowWarning && (
        <div className="bg-red-50 px-4 py-1.5 text-xs text-red-700">{overflowWarning}</div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div
          ref={printRef}
          style={{ width: previewWidth }}
          className={clsx(
            'slip-doc mx-auto bg-white p-[6mm] text-slate-900 shadow-lg',
            mode === 'data' && 'slip-hide-chrome',
            mode === 'blank' && 'slip-hide-data',
          )}
        >
          {children({ mode, copyBadge, blank: mode === 'blank' })}
        </div>
      </div>
    </div>
  );
}
