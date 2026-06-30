import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  SHIPMENT_STATUS_LABELS,
  type Asn,
  type Paginated,
  type ShipmentStatus,
} from '@lojistik/shared';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Button, Card, EmptyState, Input, Spinner } from '../components/ui';
import { ShipmentStatusBadge } from '../components/ShipmentStatusBadge';
import { useAuthStore } from '../stores/auth';

const FILTERS: { value: ShipmentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Hepsi' },
  { value: 'EXPECTED', label: SHIPMENT_STATUS_LABELS.EXPECTED },
  { value: 'IN_RECEIVING', label: SHIPMENT_STATUS_LABELS.IN_RECEIVING },
  { value: 'COMPLETED', label: SHIPMENT_STATUS_LABELS.COMPLETED },
  { value: 'CANCELLED', label: SHIPMENT_STATUS_LABELS.CANCELLED },
];

export function AsnListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ShipmentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';

  const { data, isLoading } = useQuery({
    queryKey: ['asn', { status, search }],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (status !== 'ALL') params.set('status', status);
      if (search) params.set('search', search);
      return api.get<Paginated<Asn>>(`/asn?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Ön İhbarlar</h2>
        {canEdit && <Button onClick={() => navigate('/on-ihbar/yeni')}>+ Yeni</Button>}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={clsx(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium',
              status === f.value ? 'bg-brand text-white' : 'bg-white text-slate-600',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input
        placeholder="Ara: referans veya müşteri..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Ön ihbar bulunamadı" hint="Beklenen sevkiyat için yeni ön ihbar girin." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((asn) => (
            <AsnCard key={asn.id} asn={asn} />
          ))}
        </div>
      )}
    </div>
  );
}

function AsnCard({ asn }: { asn: Asn }) {
  const totalExpected = asn.lines.reduce((s, l) => s + l.expectedQty, 0);
  const totalReceived = asn.lines.reduce((s, l) => s + l.receivedQty, 0);

  return (
    <Link to={`/on-ihbar/${asn.id}`}>
      <Card className="space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-slate-900">{asn.reference}</p>
            <p className="text-xs text-slate-500">
              {asn.customer?.name} · {asn.warehouse?.name}
            </p>
          </div>
          <ShipmentStatusBadge status={asn.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>📅 {formatDate(asn.expectedAt)}</span>
          <span>
            {asn.lines.length} kalem · {totalReceived}/{totalExpected} adet
          </span>
        </div>
      </Card>
    </Link>
  );
}
