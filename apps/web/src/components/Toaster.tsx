import { clsx } from 'clsx';
import { useToastStore, type ToastVariant } from '../lib/toast';

const STYLES: Record<ToastVariant, string> = {
  default: 'bg-slate-900/90 text-white',
  success: 'bg-emerald-600/95 text-white',
  error: 'bg-red-600/95 text-white',
};

/** Üstte beliren, içeriği itmeyen (sabit konumlu) bildirim katmanı. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'pointer-events-auto max-w-sm rounded-lg px-4 py-2 text-center text-sm font-medium shadow-lg',
            STYLES[t.variant],
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
