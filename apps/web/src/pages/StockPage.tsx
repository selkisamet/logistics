import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dispatch, Receipt, Paginated, VehicleSummary } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { formatDate, daysSince } from '../lib/format';
import { useVehicles } from '../lib/lookups';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Spinner } from '../components/ui';

type QuickTarget = {
  receiptId: string;
  customerName: string;
  inStock: number;
  plannedVehicle?: VehicleSummary | null;
};

export function StockPage() {
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickTarget | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['stock', { search }],
    queryFn: () =>
      api.get<Paginated<Receipt>>(
        `/receipts/stock?page=1&pageSize=100&search=${encodeURIComponent(search)}`,
      ),
  });

  const totalPackages = data?.items.reduce((s, r) => s + (r.packages?.length ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Depodakiler</h2>
        <p className="text-sm text-slate-500">
          Kabul edilmiş, henüz sevk edilmemiş ürünler
          {data ? ` · ${data.total} kayıt · ${totalPackages} etiketli paket` : ''}
        </p>
      </div>

      <Input
        placeholder="Ara: müşteri, referans, irsaliye no..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Depo boş görünüyor" hint="Tamamlanan mal kabuller burada listelenir." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((r) => {
            const wait = daysSince(r.completedAt);
            const pkgs = r.packages ?? [];
            const inStock = pkgs.filter((p) => !p.dispatchedAt && !p.dispatchId).length;
            const total = pkgs.length;
            return (
              <Card key={r.id} className="space-y-2">
                <Link to={`/mal-kabul/${r.id}`} className="block space-y-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{r.customer?.name}</p>
                      <p className="text-xs text-slate-500">
                        {r.reference}
                        {r.waybillNo ? ` · İrs: ${r.waybillNo}` : ''}
                      </p>
                    </div>
                    <WaitBadge days={wait} />
                  </div>
                  <p className="text-xs text-slate-500">📅 Giriş: {formatDate(r.completedAt)}</p>
                </Link>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  {r.plannedVehicle ? (
                    <Badge className="bg-indigo-100 text-indigo-700">
                      🚚 {r.plannedVehicle.plate}
                      {r.plannedVehicle.trailerPlate ? ` / ${r.plannedVehicle.trailerPlate}` : ''}
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500">🚚 Araç belirsiz</Badge>
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {inStock}
                    {total > inStock ? `/${total}` : ''} palet depoda
                  </span>
                </div>

                {inStock > 0 && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      setQuick({
                        receiptId: r.id,
                        customerName: r.customer?.name ?? 'Müşteri',
                        inStock,
                        plannedVehicle: r.plannedVehicle,
                      })
                    }
                  >
                    🚚 Sevk Et ({inStock})
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {quick && <QuickDispatchModal target={quick} onClose={() => setQuick(null)} />}
    </div>
  );
}

/**
 * Depo kartından tek adım sevk: plaka elle girilmez, planlanan araç ön-seçili gelir.
 * Araç değişmişse burada farklı bir kayıtlı araç seçilir (plan ayrıca düzenlenmez).
 */
function QuickDispatchModal({ target, onClose }: { target: QuickTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState(target.plannedVehicle?.id ?? '');

  const mut = useMutation({
    mutationFn: () =>
      api.post<Dispatch>('/dispatches/quick', {
        receiptId: target.receiptId,
        vehicleId: vehicleId || undefined,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      toast(`🚚 ${target.inStock} palet sevk edildi · ${d.reference}`);
      onClose();
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Sevk edilemedi'),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md space-y-3 rounded-b-none sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-slate-900">Hızlı Sevk</h3>
          <p className="text-sm text-slate-500">
            {target.customerName} · {target.inStock} palet
          </p>
        </div>

        <Field label="Araç / Plaka">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Araç seçin...</option>
            {vehicles?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate}
                {v.driverName ? ` - ${v.driverName}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {target.plannedVehicle && vehicleId === target.plannedVehicle.id && (
          <p className="text-xs text-green-600">✓ Ön ihbarda planlanan araç seçili.</p>
        )}
        {!vehicleId && (
          <p className="text-xs text-amber-600">
            Plakayı elle yazmadan listeden seçin. Araç kayıtlı değilse Araçlar'dan ekleyin.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!vehicleId}
            loading={mut.isPending}
            onClick={() => mut.mutate()}
          >
            🚚 Sevk Et ({target.inStock})
          </Button>
        </div>
      </Card>
    </div>
  );
}

function WaitBadge({ days }: { days: number }) {
  const cls =
    days >= 7
      ? 'bg-red-100 text-red-700'
      : days >= 3
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';
  return <Badge className={cls}>{days === 0 ? 'Bugün' : `${days} gündür`}</Badge>;
}
