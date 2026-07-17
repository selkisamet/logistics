import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { formatPlate } from '../lib/plate';
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Icon } from './icons';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-dark',
    secondary: 'bg-slate-200 text-slate-800 hover:bg-slate-300',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      className={clsx(base, variants[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={clsx(
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * Aranabilir açılır liste (combobox). Yazdıkça filtreler; klavye (yön tuşları/Enter/Esc),
 * dışına tıklayınca kapanır. Kontrollü: value/onChange. `nullable` ile "boş" seçeneği sunar.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Seçin...',
  nullable = false,
  nullableLabel = 'Belirsiz / boş',
  disabled = false,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  nullable?: boolean;
  nullableLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    // "Boş" satırı yalnızca arama yokken en üstte sabit dursun
    return nullable && !q ? [{ value: '', label: nullableLabel }, ...filtered] : filtered;
  }, [options, query, nullable, nullableLabel]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setHighlight(0);
    setOpen(true);
  };
  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) {
        e.preventDefault();
        const it = items[highlight];
        if (it) choose(it.value);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const display = open ? query : (selected?.label ?? '');

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          disabled={disabled}
          value={display}
          placeholder={selected ? selected.label : placeholder}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={clsx(
            'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
            disabled && 'cursor-not-allowed bg-slate-100 text-slate-400',
            !selected && !open && 'text-slate-400',
          )}
        />
        <Icon
          name="chevron"
          className={clsx(
            'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform',
            open ? '-rotate-90' : 'rotate-90',
          )}
        />
      </div>

      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {items.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">Sonuç yok</li>
          ) : (
            items.map((opt, i) => {
              const isSel = opt.value === value;
              const isHi = i === highlight;
              return (
                <li key={opt.value || '__empty__'}>
                  <button
                    type="button"
                    ref={isHi ? activeRef : undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(opt.value)}
                    className={clsx(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                      isHi ? 'bg-brand/10 text-brand' : 'text-slate-700',
                      isSel && 'font-medium',
                    )}
                  >
                    <span className="truncate">
                      {opt.label}
                      {opt.hint && <span className="ml-1 text-xs text-slate-400">{opt.hint}</span>}
                    </span>
                    {isSel && <span className="text-brand">✓</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Aranabilir ÇOKLU seçim combobox. Seçilenler kutunun içinde chip olarak durur; yazdıkça filtreler.
 * `onCreate` verilirse, aranan metin listede yoksa "… oluştur" satırı çıkar (kalıcı kayıt üretir).
 * Kontrollü: value (seçili ComboOption[]) / onChange.
 */
export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = 'Seç / ara...',
  onCreate,
  disabled = false,
  emptyHint = 'Sonuç yok',
}: {
  options: ComboOption[];
  value: ComboOption[];
  onChange: (value: ComboOption[]) => void;
  placeholder?: string;
  /** Verilirse aranan metin listede yoksa "oluştur" seçeneği gösterilir; oluşturulan option döner. */
  onCreate?: (label: string) => Promise<ComboOption>;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = new Set(value.map((v) => v.value));
  const q = query.trim().toLowerCase();
  const filtered = options.filter(
    (o) => !selectedIds.has(o.value) && (!q || o.label.toLowerCase().includes(q)),
  );
  const showCreate =
    !!onCreate &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === q) &&
    !value.some((o) => o.label.toLowerCase() === q);
  const itemCount = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const add = (opt: ComboOption) => {
    onChange([...value, opt]);
    setQuery('');
    setHighlight(0);
    inputRef.current?.focus();
  };
  const removeVal = (val: string) => onChange(value.filter((v) => v.value !== val));
  const create = async () => {
    if (!onCreate || busy) return;
    const label = query.trim();
    if (!label) return;
    setBusy(true);
    try {
      const opt = await onCreate(label);
      onChange([...value, opt]);
      setQuery('');
      setHighlight(0);
    } catch {
      /* hata onCreate tarafında toast'lanır */
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };
  const choose = (i: number) => {
    if (i < filtered.length) add(filtered[i]);
    else if (showCreate) void create();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.min(h + 1, itemCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && itemCount > 0) {
        e.preventDefault();
        choose(highlight);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      removeVal(value[value.length - 1].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
        className={clsx(
          'flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm',
          disabled ? 'cursor-not-allowed border-slate-200 bg-slate-100' : 'cursor-text bg-white',
          open ? 'border-brand ring-2 ring-brand/20' : 'border-slate-300',
        )}
      >
        {value.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand"
          >
            {o.label}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeVal(o.value);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-brand/60 hover:bg-brand/20 hover:text-red-600"
              aria-label="Kaldır"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={value.length === 0 ? placeholder : ''}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-w-[90px] flex-1 bg-transparent px-1 py-1 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
        />
      </div>

      {open && !disabled && (
        <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {itemCount === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">{emptyHint}</li>
          ) : (
            <>
              {filtered.map((opt, i) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => add(opt)}
                    className={clsx(
                      'flex w-full items-center px-3 py-2 text-left text-sm',
                      i === highlight ? 'bg-brand/10 text-brand' : 'text-slate-700',
                    )}
                  >
                    <span className="truncate">
                      {opt.label}
                      {opt.hint && <span className="ml-1 text-xs text-slate-400">{opt.hint}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {showCreate && (
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(filtered.length)}
                    onClick={() => void create()}
                    disabled={busy}
                    className={clsx(
                      'flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-sm',
                      filtered.length === highlight ? 'bg-brand/10 text-brand' : 'text-slate-700',
                    )}
                  >
                    {busy ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                    ) : (
                      <span className="text-base leading-none text-brand">+</span>
                    )}
                    <span>
                      "<b>{query.trim()}</b>" oluştur
                    </span>
                  </button>
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

/** Plaka girişi: yazıldıkça otomatik büyük harf + standart boşluklama. (kontrollü) */
export function PlateInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(formatPlate(e.target.value))}
      placeholder={placeholder ?? '34 ABC 123'}
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-md border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        className ?? 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand" />
    </div>
  );
}

/** Odaklı form penceresi: masaüstünde ortada, mobilde alttan kayan sayfa.
 *  Ekleme/düzenleme formları listeyle aynı yüzeyde karışmasın diye burada açılır.
 *
 *  `document.body`'ye PORTAL edilir: AppLayout içinde render edilirse sticky başlık
 *  (`backdrop-blur` → kendi stacking context'i) overlay'in üstünde kalıp beyaz şerit
 *  bırakıyor. Portal + z-[60] (çekmece z-50, sidebar z-30, başlık/tab bar z-20 üstü)
 *  ile tüm arayüzün üzerine biner. */
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Arkadaki liste kaymasın
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={clsx(
          'w-full rounded-t-xl bg-white shadow-xl sm:rounded-xl',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="-m-1 rounded p-1 text-xl leading-none text-slate-400 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
