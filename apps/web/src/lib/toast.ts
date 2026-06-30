import { create } from 'zustand';

type Toast = { id: number; message: string };

interface ToastState {
  toasts: Toast[];
  show: (message: string) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message) => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2200);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Her yerden çağrılabilen kısa bildirim (akışı bozmayan, sabit konumlu). */
export function toast(message: string) {
  useToastStore.getState().show(message);
}
