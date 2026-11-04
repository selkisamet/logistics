import { clsx } from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PENDING_REGION_LABEL, type Receipt } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { useRegions } from '../lib/lookups';
import { Button, Select } from './ui';
import { Icon } from './icons';

/** Malın gideceği bölge ile fiilen durduğu bölge farklı mı? (null = BEKLEYEN) */
export function needsRelocation(r: Pick<Receipt, 'regionId' | 'storedRegionId'>): boolean {
  return (r.regionId ?? null) !== (r.storedRegionId ?? null);
}

/**
 * Depo içi yerleşim: gideceği bölge seçimi + "yer değiştir" görevi.
 *
 * Bölge sonradan öğrenildiğinde (müşteri yarım saat sonra haber verir) kim öğrenirse
 * buradan girer; mal fiilen taşınana kadar eski yerinde sayılır ve depocuya
 * "BEKLEYEN → GEBZE" görevi çıkar. "Taşındı" deyince görev kapanır.
 */
export function RegionPlacement({ receipt, compact = false }: { receipt: Receipt; compact?: boolean }) {
  const qc = useQueryClient();
  const { data: regions } = useRegions();

  const onSuccess = (r: Receipt) => {
    qc.setQueryData(['receipts', r.id], r);
    qc.invalidateQueries({ queryKey: ['stock'] });
  };
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi');

  const setRegion = useMutation({
    mutationFn: (regionId: string) =>
      api.patch<Receipt>(`/receipts/${receipt.id}/region`, { regionId: regionId || null }),
    onSuccess: (r) => {
      onSuccess(r);
      toast(`Bölge: ${r.region?.name ?? PENDING_REGION_LABEL}`);
    },
    onError,
  });
  const relocated = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${receipt.id}/relocated`),
    onSuccess: (r) => {
      onSuccess(r);
      toast(`${r.region?.name ?? PENDING_REGION_LABEL} alanına taşındı`);
    },
    onError,
  });

  const target = receipt.region?.name ?? PENDING_REGION_LABEL;
  const stored = receipt.storedRegion?.name ?? PENDING_REGION_LABEL;
  const move = needsRelocation(receipt);
  // Pasife alınmış bölge seçim listesinde yok ama kayıtta duruyor olabilir — kaybolmasın
  const options = [
    ...(regions ?? []),
    ...(receipt.region && !regions?.some((r) => r.id === receipt.region!.id) ? [receipt.region] : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={clsx('shrink-0 text-slate-500', compact ? 'text-xs' : 'text-sm')}>
          Bölge
        </span>
        <Select
          value={receipt.regionId ?? ''}
          disabled={setRegion.isPending}
          onChange={(e) => setRegion.mutate(e.target.value)}
          className={clsx(
            compact && 'py-1.5',
            receipt.regionId
              ? 'font-semibold text-emerald-800'
              : 'border-amber-300 bg-amber-50 text-amber-800',
          )}
          aria-label="Bölge"
        >
          <option value="">{PENDING_REGION_LABEL} (bilinmiyor)</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      {move && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Yer değiştir: {stored} → {target}
            </span>
          </span>
          <Button
            variant="secondary"
            className="shrink-0 py-1.5"
            loading={relocated.isPending}
            onClick={() => relocated.mutate()}
          >
            <Icon name="check" className="h-4 w-4" /> Taşındı
          </Button>
        </div>
      )}
    </div>
  );
}
