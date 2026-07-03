import { create } from 'zustand';

type DialogKind = 'confirm' | 'alert';

export type DialogData = {
  id: number;
  kind: DialogKind;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: (value: boolean) => void;
};

interface DialogState {
  current: DialogData | null;
  open: (d: DialogData) => void;
  close: (value: boolean) => void;
}

let counter = 0;

export const useDialogStore = create<DialogState>((set, get) => ({
  current: null,
  open: (d) => set({ current: d }),
  close: (value) => {
    const cur = get().current;
    if (cur) cur.resolve(value);
    set({ current: null });
  },
}));

/** Onay modalı — SweetAlert benzeri, uygulama tasarımında. Promise<boolean> döner. */
export function confirmDialog(opts: {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      id: ++counter,
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'Onayla',
      cancelText: opts.cancelText ?? 'Vazgeç',
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

/** Bilgi/uyarı modalı — tek "Tamam" butonu. */
export function alertDialog(opts: { title?: string; message: string; confirmText?: string }): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().open({
      id: ++counter,
      kind: 'alert',
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? 'Tamam',
      cancelText: '',
      danger: false,
      resolve: () => resolve(),
    });
  });
}
