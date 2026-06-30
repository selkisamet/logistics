import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  RECEIPT_STATUS_LABELS,
  type Receipt,
  type Paginated,
  type ReceiptStatus,
} from '@lojistik/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { ReceiptStatusBadge } from '../components/ReceiptStatusBadge';

const FILTERS: { value: ReceiptStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Hepsi' },
  { value: 'IN_PROGRESS', label: RECEIPT_STATUS_LABELS.IN_PROGRESS },
  { value: 'COMPLETED', label: RECEIPT_STATUS_LABELS.COMPLETED },
  { value: 'CANCELLED', label: RECEIPT_STATUS_LABELS.CANCELLED },
];

export function ReceiptListPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReceiptStatus | 'ALL'>('ALL');

  const { data, isLoading } = useQuery({
    queryKey: ['receipts', { status }],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (status !== 'ALL') params.set('status', status);
      return api.get<Paginated<Receipt>>(`/receipts?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Mal Kabul</h2>
        <Button onClick={() => navigate('/mal-kabul/baslat')}>+ Yeni</Button>
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
        <EmptyState title="Mal kabul kaydı yok" hint="Yeni bir mal kabul başlatın." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((r) => {
            const counted = r.lines.reduce((s, l) => s + l.countedQty, 0);
            const expected = r.lines.reduce((s, l) => s + (l.expectedQty ?? 0), 0);
            return (
              <Link key={r.id} to={`/mal-kabul/${r.id}`}>
                <Card className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{r.reference}</p>
                      <p className="text-xs text-slate-500">
                        {r.customer?.name}
                        {r.asnReference ? ` · Öİ: ${r.asnReference}` : ' · Kör kabul'}
                      </p>
                    </div>
                    <ReceiptStatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>🕒 {formatDateTime(r.startedAt)}</span>
                    <span>
                      {counted}
                      {expected ? `/${expected}` : ''} adet · {r.lines.length} kalem
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
