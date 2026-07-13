import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  PACKAGE_TYPE_LABELS,
  type Dispatch,
  type Paginated,
  type Receipt,
  type Package,
  type PackageType,
  type AddDispatchPackageInput,
  type VehicleSummary,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { formatDateTime } from '../lib/format';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { DispatchStatusBadge } from '../components/DispatchStatusBadge';
import { BarcodeScanner } from '../components/BarcodeScanner';

type StockPallet = {
  pkg: Package;
  customerName?: string;
  receiptRef: string;
  plannedVehicle?: VehicleSummary | null;
};

export function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'single' | 'lot'>('single');

  const { data: dispatch, isLoading } = useQuery({
    queryKey: ['dispatches', id],
    queryFn: () => api.get<Dispatch>(`/dispatches/${id}`),
    enabled: !!id,
  });

  const setDispatch = (d: Dispatch) => qc.setQueryData(['dispatches', id], d);
  const afterChange = (d: Dispatch) => {
    setDispatch(d);
    qc.invalidateQueries({ queryKey: ['stock'] });
  };

  const addMut = useMutation({
    mutationFn: (body: AddDispatchPackageInput) =>
      api.post<Dispatch>(`/dispatches/${id}/packages`, body),
    onSuccess: (d) => {
      afterChange(d);
      toast(`✓ Palet eklendi (${d.packages.length})`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Eklenemedi'),
  });
  const bulkAddMut = useMutation({
    mutationFn: (ids: string[]) =>
      api.post<Dispatch>(`/dispatches/${id}/packages/bulk`, { packageIds: ids }),
    onSuccess: (d) => {
      afterChange(d);
      toast(`✓ ${d.packages.length} palet yüklendi`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Eklenemedi'),
  });
  const removeMut = useMutation({
    mutationFn: (packageId: string) =>
      api.delete<Dispatch>(`/dispatches/${id}/packages/${packageId}`),
    onSuccess: afterChange,
  });
  const completeMut = useMutation({
    mutationFn: () => api.post<Dispatch>(`/dispatches/${id}/complete`),
    onSuccess: (d) => {
      setDispatch(d);
      qc.invalidateQueries({ queryKey: ['dispatches'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Sevk edilemedi'),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.post<Dispatch>(`/dispatches/${id}/cancel`),
    onSuccess: afterChange,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'İptal edilemedi'),
  });

  const editable = dispatch?.status === 'DRAFT';

  // Depodaki uygun paletler (sadece taslakta) — kabul kayıtlarından düz listeye
  const { data: stockPallets } = useQuery({
    queryKey: ['stock', { forDispatchPallets: true }],
    queryFn: () => api.get<Paginated<Receipt>>('/receipts/stock?page=1&pageSize=100'),
    enabled: !!editable,
    select: (d): StockPallet[] =>
      d.items.flatMap((r) =>
        (r.packages ?? [])
          .filter((p) => !p.dispatchedAt && !p.dispatchId)
          .map((pkg) => ({
            pkg,
            customerName: r.customer?.name,
            receiptRef: r.reference,
            plannedVehicle: r.plannedVehicle,
          })),
      ),
  });

  if (isLoading) return <Spinner />;
  if (!dispatch) return <p className="text-slate-500">Sevkiyat bulunamadı.</p>;

  // Bu sevkiyatın aracına planlanan paletler öne gelsin
  const targetVehicleId = dispatch.vehicle?.id ?? null;
  const isMatch = (planned?: VehicleSummary | null) =>
    !!targetVehicleId && planned?.id === targetVehicleId;
  const sortedPallets = [...(stockPallets ?? [])].sort(
    (a, b) => Number(isMatch(b.plannedVehicle)) - Number(isMatch(a.plannedVehicle)),
  );
  const matchingPallets = targetVehicleId
    ? sortedPallets.filter((s) => isMatch(s.plannedVehicle))
    : [];

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/sevkiyat')} className="text-slate-500">
        ← Sevkiyatlar
      </button>

      <Card className="space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{dispatch.destination}</h2>
            <p className="text-xs text-slate-500">
              {dispatch.reference}
              {dispatch.vehicle
                ? ` · ${dispatch.vehicle.plate}${dispatch.vehicle.driverName ? ` (${dispatch.vehicle.driverName})` : ''}${dispatch.vehicle.trailerPlate ? ` · Dorse ${dispatch.vehicle.trailerPlate}` : ''}`
                : `${dispatch.vehiclePlate ? ` · ${dispatch.vehiclePlate}` : ''}${dispatch.driverName ? ` · ${dispatch.driverName}` : ''}`}
            </p>
          </div>
          <DispatchStatusBadge status={dispatch.status} />
        </div>
        {dispatch.dispatchedAt && (
          <p className="text-xs text-slate-500">Sevk: {formatDateTime(dispatch.dispatchedAt)}</p>
        )}
        {dispatch.notes && (
          <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{dispatch.notes}</p>
        )}
      </Card>

      {editable && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Okutunca:</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              <button
                onClick={() => setScanMode('single')}
                className={clsx(
                  'px-3 py-1.5 font-medium',
                  scanMode === 'single' ? 'bg-brand text-white' : 'bg-white text-slate-600',
                )}
              >
                Sadece bu palet
              </button>
              <button
                onClick={() => setScanMode('lot')}
                className={clsx(
                  'px-3 py-1.5 font-medium',
                  scanMode === 'lot' ? 'bg-brand text-white' : 'bg-white text-slate-600',
                )}
              >
                Girişin tümü
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setScanning(true)}>📷 Palet QR Okut</Button>
            <Button
              variant="secondary"
              loading={cancelMut.isPending}
              onClick={async () => {
                if (
                  await confirmDialog({
                    message: 'Sevkiyat iptal edilsin mi? Paletler depoya geri döner.',
                    confirmText: 'İptal Et',
                    danger: true,
                  })
                )
                  cancelMut.mutate();
              }}
            >
              İptal Et
            </Button>
          </div>
        </div>
      )}

      {/* Yüklenen paletler */}
      <Card className="space-y-2">
        <h3 className="font-semibold text-slate-900">Yüklenen Paletler ({dispatch.packages.length})</h3>
        {dispatch.packages.length === 0 ? (
          <p className="text-xs text-slate-400">Palet QR okutun ya da aşağıdan depodan ekleyin.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dispatch.packages.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.code}</p>
                  <p className="text-xs text-slate-500">
                    {PACKAGE_TYPE_LABELS[p.type as PackageType] ?? p.type} · {p.customerName}
                    {p.waybillNo ? ` · İrs: ${p.waybillNo}` : ''}
                  </p>
                </div>
                {editable && (
                  <button
                    onClick={() => removeMut.mutate(p.id)}
                    className="text-xs font-medium text-red-600"
                  >
                    Çıkar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Paletsiz (kabul düzeyi) sevk edilen mal kabuller */}
      {(dispatch.receipts ?? []).length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-semibold text-slate-900">
            Sevk Edilen Kabuller ({dispatch.receipts.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {dispatch.receipts.map((r) => (
              <Link
                key={r.id}
                to={`/mal-kabul/${r.id}`}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{r.reference}</p>
                  <p className="text-xs text-slate-500">{r.customerName ?? '—'}</p>
                </div>
                <span className="text-xs text-slate-500">{r.itemCount} adet</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Depodan ekle (palet) */}
      {editable && (
        <Card className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900">Depodan Palet Ekle</h3>
            <div className="flex flex-wrap gap-2">
              {matchingPallets.length > 0 && (
                <Button
                  loading={bulkAddMut.isPending}
                  onClick={() => bulkAddMut.mutate(matchingPallets.map((s) => s.pkg.id))}
                >
                  🚚 Bu araca planlı ({matchingPallets.length})
                </Button>
              )}
              {sortedPallets.length > 0 && (
                <Button
                  variant="secondary"
                  loading={bulkAddMut.isPending}
                  onClick={() => bulkAddMut.mutate(sortedPallets.map((s) => s.pkg.id))}
                >
                  Hepsini Ekle ({sortedPallets.length})
                </Button>
              )}
            </div>
          </div>
          {targetVehicleId ? (
            <p className="text-xs text-slate-400">
              ✓ = bu sevkiyatın aracına planlandı · ⚠ = başka araca planlı.
            </p>
          ) : (
            <p className="text-xs text-amber-600">
              Bu sevkiyata araç seçilmemiş; planlanan araçla eşleştirme yapılamıyor.
            </p>
          )}
          {sortedPallets.length === 0 ? (
            <EmptyState title="Eklenecek palet yok" hint="Depoda sevk bekleyen palet yok." />
          ) : (
            <div className="space-y-2">
              {sortedPallets.map(({ pkg, customerName, receiptRef, plannedVehicle }) => (
                <div
                  key={pkg.id}
                  className={clsx(
                    'flex items-center justify-between rounded-lg border p-2',
                    isMatch(plannedVehicle)
                      ? 'border-green-300 bg-green-50/40'
                      : 'border-slate-200',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900">{pkg.code}</p>
                      <PlannedTag planned={plannedVehicle} targetId={targetVehicleId} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {PACKAGE_TYPE_LABELS[pkg.type as PackageType] ?? pkg.type} · {customerName} · {receiptRef}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    loading={addMut.isPending}
                    onClick={() => addMut.mutate({ packageId: pkg.id })}
                  >
                    Ekle
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {editable && (
        <Button
          className="w-full"
          loading={completeMut.isPending}
          disabled={dispatch.packages.length === 0}
          onClick={async () => {
            if (
              await confirmDialog({
                message: `${dispatch.packages.length} palet sevk edilsin mi?`,
                confirmText: 'Sevk Et',
              })
            )
              completeMut.mutate();
          }}
        >
          🚚 Sevk Et ({dispatch.packages.length} palet)
        </Button>
      )}

      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            setScanning(false);
            addMut.mutate({ packageCode: code, wholeReceipt: scanMode === 'lot' });
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

/** Paletin ön ihbarda planlanan aracını gösterir; sevkiyatın aracıyla eşleşmeyi vurgular. */
function PlannedTag({
  planned,
  targetId,
}: {
  planned?: VehicleSummary | null;
  targetId: string | null;
}) {
  const base = 'rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap';
  if (!planned) return <span className={clsx(base, 'bg-slate-100 text-slate-500')}>araç belirsiz</span>;
  if (targetId && planned.id === targetId)
    return <span className={clsx(base, 'bg-green-100 text-green-700')}>✓ {planned.plate}</span>;
  if (targetId)
    return <span className={clsx(base, 'bg-amber-100 text-amber-700')}>⚠ {planned.plate}</span>;
  return <span className={clsx(base, 'bg-indigo-100 text-indigo-700')}>🚚 {planned.plate}</span>;
}
