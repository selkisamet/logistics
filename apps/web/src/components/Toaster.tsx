import { useToastStore } from '../lib/toast';

/** Üstte beliren, içeriği itmeyen (sabit konumlu) bildirim katmanı. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto max-w-sm rounded-lg bg-slate-900/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
