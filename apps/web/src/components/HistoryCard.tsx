import { useQuery } from '@tanstack/react-query';
import { auditLabel, type AuditEvent } from '@lojistik/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { CollapsibleCard, Spinner } from './ui';

/**
 * "Geçmiş" kartı — kaydın denetim izi (kim ne zaman ne yaptı).
 *
 * `AuditEvent` tablosuna baştan beri yazılıyordu ama hiçbir yerde okunmuyordu.
 * Geriye dönük sorgulamada asıl merak edilen "bu kaydı kim açtı, kim geri
 * aldı" sorusunu bu kart cevaplıyor.
 *
 * Kapalı açılır: günlük işin parçası değil, ihtiyaç olunca bakılır.
 */
export function HistoryCard({ path }: { path: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['history', path],
    queryFn: () => api.get<AuditEvent[]>(path),
  });

  return (
    <CollapsibleCard title="Geçmiş" summary={data ? `${data.length} olay` : ''}>
      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-slate-500">Kayıtlı olay yok.</p>
      ) : (
        <ol className="space-y-2">
          {data.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                {/* Etiketi olmayan action ham basılır — yeni olay eklenince ekran boş kalmasın */}
                <p className="font-medium text-slate-800">{auditLabel(e.action)}</p>
                <p className="text-xs text-slate-500">{e.userName ?? 'Bilinmiyor'}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-400">
                {formatDateTime(e.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </CollapsibleCard>
  );
}
