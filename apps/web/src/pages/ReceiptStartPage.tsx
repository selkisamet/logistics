import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import type { Asn, Paginated, Receipt, StartReceiptInput } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { Button, Card, EmptyState, Field, Select, Spinner } from '../components/ui';
import { useCustomers, useWarehouses } from '../lib/lookups';

type Mode = 'asn' | 'blind';

export function ReceiptStartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('asn');
  const [serverError, setServerError] = useState<string | null>(null);

  const startMut = useMutation({
    mutationFn: (input: StartReceiptInput) => api.post<Receipt>('/receipts/start', input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['asn'] });
      navigate(`/mal-kabul/${r.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Başlatılamadı'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Mal Kabul Başlat</h2>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TabButton active={mode === 'asn'} onClick={() => setMode('asn')}>
          📋 Ön İhbardan
        </TabButton>
        <TabButton active={mode === 'blind'} onClick={() => setMode('blind')}>
          📦 Kör Kabul
        </TabButton>
      </div>

      {serverError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
      )}

      {mode === 'asn' ? (
        <AsnPicker onPick={(asnId) => startMut.mutate({ asnId })} loading={startMut.isPending} />
      ) : (
        <BlindForm
          onStart={(customerId, warehouseId) => startMut.mutate({ customerId, warehouseId })}
          loading={startMut.isPending}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-lg py-3 text-sm font-semibold',
        active ? 'bg-brand text-white' : 'bg-white text-slate-600',
      )}
    >
      {children}
    </button>
  );
}

function AsnPicker({ onPick, loading }: { onPick: (id: string) => void; loading: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['asn', { forReceipt: true }],
    queryFn: () => api.get<Paginated<Asn>>('/asn?page=1&pageSize=100'),
    select: (d) => d.items.filter((a) => a.status === 'EXPECTED' || a.status === 'IN_RECEIVING'),
  });

  if (isLoading) return <Spinner />;
  if (!data || data.length === 0)
    return <EmptyState title="Beklenen ön ihbar yok" hint="Önce bir ön ihbar oluşturun ya da kör kabul yapın." />;

  return (
    <div className="flex flex-col gap-4">
      {data.map((asn) => (
        <Card key={asn.id} className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">{asn.reference}</p>
            <p className="text-xs text-slate-500">
              {asn.customer?.name} · {asn.lines.length} kalem · {formatDate(asn.expectedAt)}
            </p>
          </div>
          <Button onClick={() => onPick(asn.id)} loading={loading}>
            Başlat
          </Button>
        </Card>
      ))}
    </div>
  );
}

function BlindForm({
  onStart,
  loading,
}: {
  onStart: (customerId: string, warehouseId: string) => void;
  loading: boolean;
}) {
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  return (
    <Card className="space-y-3">
      <Field label="Müşteri *">
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Seçin...</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Hedef Depo *">
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">Seçin...</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({w.code})
            </option>
          ))}
        </Select>
      </Field>
      <Button
        className="w-full"
        disabled={!customerId || !warehouseId}
        loading={loading}
        onClick={() => onStart(customerId, warehouseId)}
      >
        Kör Kabul Başlat
      </Button>
    </Card>
  );
}
