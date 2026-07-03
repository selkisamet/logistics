import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'error';
type Toast = { id: number; message: string; variant: ToastVariant };

interface ToastState {
  toasts: Toast[];
  show: (message: string, variant: ToastVariant) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, variant) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }));
    const ttl = variant === 'error' ? 3800 : 2200;
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/**
 * Her yerden çağrılabilen kısa bildirim (akışı bozmayan, sabit konumlu).
 * `toast(msg)` nötr, `toast.success(msg)` yeşil, `toast.error(msg)` kırmızı.
 */
export const toast = Object.assign(
  (message: string) => useToastStore.getState().show(message, 'default'),
  {
    success: (message: string) => useToastStore.getState().show(message, 'success'),
    error: (message: string) => useToastStore.getState().show(message, 'error'),
  },
);
