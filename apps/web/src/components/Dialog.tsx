import { useEffect } from 'react';
import { useDialogStore } from '../lib/dialog';
import { Button, Card } from './ui';

/** Aktif onay/uyarı modalını render eder (AppLayout'ta bir kez mount edilir). */
export function Dialog() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.close);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [current, close]);

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <Card
        className="w-full max-w-sm space-y-4 rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {current.title && (
          <h3 className="text-lg font-semibold text-slate-900">{current.title}</h3>
        )}
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{current.message}</p>
        <div className="flex justify-end gap-2 pt-1">
          {current.kind === 'confirm' && (
            <Button variant="secondary" onClick={() => close(false)}>
              {current.cancelText}
            </Button>
          )}
          <Button variant={current.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
            {current.confirmText}
          </Button>
        </div>
      </Card>
    </div>
  );
}
