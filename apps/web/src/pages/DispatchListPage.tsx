import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  DISPATCH_STATUS_LABELS,
  type Dispatch,
  type Paginated,
  type DispatchStatus,
} from '@lojistik/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { DispatchStatusBadge } from '../components/DispatchStatusBadge';

const FILTERS: { value: DispatchStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Hepsi' },
  { value: 'DRAFT', label: DISPATCH_STATUS_LABELS.DRAFT },
  { value: 'DISPATCHED', label: DISPATCH_STATUS_LABELS.DISPATCHED },
  { value: 'CANCELLED', label: DISPATCH_STATUS_LABELS.CANCELLED },
];

export function DispatchListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DispatchStatus | 'ALL'>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['dispatches', { status }],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (status !== 'ALL') params.set('status', status);
      return api.get<Paginated<Dispatch>>(`/dispatches?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Sevkiyat</h2>
        <Button onClick={() => navigate('/sevkiyat/yeni')}>+ Yeni</Button>
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

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Sevkiyat yok" hint="Depodaki ürünleri çıkışa almak için yeni sevkiyat oluşturun." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((d) => {
            const items = d.items ?? [];
            const kap = items.filter((i) => i.kind === 'PACKAGE').length;
            const adet = items.filter((i) => i.kind === 'LINE').reduce((s, i) => s + i.qty, 0);
            // Çok müşterili sefer: irsaliyede hepsi görünür, listede de belli olsun
            const senders = [...new Set(items.map((i) => i.customerName).filter(Boolean))];
            return (
              <Link key={d.id} to={`/sevkiyat/${d.id}`}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{d.destination}</p>
                      <p className="text-xs text-slate-500">
                        {d.reference}
                        {d.vehiclePlate ? ` · ${d.vehiclePlate}` : ''}
                        {d.stops?.length ? ` · ${d.stops.length} durak` : ''}
                      </p>
                    </div>
                    <DispatchStatusBadge status={d.status} />
                  </div>
                  {senders.length > 0 && (
                    <p className="truncate text-xs text-slate-600">
                      {senders.length > 1 && (
                        <span className="mr-1 rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700">
                          {senders.length} müşteri
                        </span>
                      )}
                      {senders.join(', ')}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>🕒 {formatDateTime(d.dispatchedAt ?? d.createdAt)}</span>
                    <span>
                      {kap ? `${kap} kap` : ''}
                      {kap && adet ? ' · ' : ''}
                      {adet ? `${adet} adet` : ''}
                      {!kap && !adet ? 'yük yok' : ''}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
