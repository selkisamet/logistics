import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { type Asn } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { formatDate } from '../lib/format';
import { useVehicles } from '../lib/lookups';
import { Button, Card, Combobox, Field, Spinner } from '../components/ui';
import { ShipmentStatusBadge } from '../components/ShipmentStatusBadge';
import { useAuthStore } from '../stores/auth';

export function AsnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';
  const isAdmin = role === 'ADMIN';

  const { data: asn, isLoading } = useQuery({
    queryKey: ['asn', id],
    queryFn: () => api.get<Asn>(`/asn/${id}`),
    enabled: !!id,
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post<Asn>(`/asn/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asn'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'İşlem başarısız'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/asn/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asn'] });
      navigate('/on-ihbar', { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Silme başarısız'),
  });

  if (isLoading) return <Spinner />;
  if (!asn) return <p className="text-slate-500">Ön ihbar bulunamadı.</p>;

  const canCancel = canEdit && asn.status !== 'COMPLETED' && asn.status !== 'CANCELLED';
  const totalExpected = asn.lines.reduce((s, l) => s + l.expectedQty, 0);

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/on-ihbar')} className="text-slate-500">
        ← Ön İhbarlar
      </button>

      <Card className="space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{asn.reference}</h2>
            <p className="text-sm text-slate-500">
              {asn.customer?.name} · {asn.warehouse?.name}
            </p>
          </div>
          <ShipmentStatusBadge status={asn.status} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Info label="Beklenen tarih" value={formatDate(asn.expectedAt)} />
          <Info
            label="Kaynak"
            value={asn.sources.length ? asn.sources.map((s) => s.label).join(', ') : '–'}
          />
          <Info
            label="Alıcı"
            value={asn.recipients.length ? asn.recipients.map((r) => r.label).join(', ') : '–'}
          />
          <Info label="Toplam kalem" value={String(asn.lines.length)} />
          <Info label="Toplam adet" value={String(totalExpected)} />
        </dl>
        <PlannedVehicleEditor asn={asn} canEdit={canEdit && asn.status !== 'CANCELLED'} />
        {asn.notes && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{asn.notes}</p>}
      </Card>

      <Card className="space-y-2">
        <h3 className="font-semibold text-slate-900">Kalemler</h3>
        <div className="divide-y divide-slate-100">
          {asn.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">{l.description}</p>
                {(l.sku || l.barcode) && (
                  <p className="text-xs text-slate-500">
                    {[l.sku, l.barcode].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="text-right text-sm">
                <span className="font-semibold text-slate-900">
                  {l.receivedQty}/{l.expectedQty}
                </span>
                <span className="ml-1 text-xs text-slate-400">{l.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {asn.status === 'EXPECTED' && (
        <Button
          className="w-full"
          onClick={() => navigate('/mal-kabul')}
          title="Faz 3'te aktif olacak"
        >
          📦 Mal Kabul Başlat (Faz 3)
        </Button>
      )}

      {(canCancel || isAdmin) && (
        <div className="flex gap-2">
          {canCancel && (
            <Button
              variant="secondary"
              className="flex-1"
              loading={cancelMut.isPending}
              onClick={async () => {
                if (await confirmDialog({ message: 'Ön ihbar iptal edilsin mi?', danger: true }))
                  cancelMut.mutate();
              }}
            >
              İptal Et
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="danger"
              className="flex-1"
              loading={deleteMut.isPending}
              onClick={async () => {
                if (
                  await confirmDialog({
                    title: 'Ön ihbarı sil',
                    message: 'Ön ihbar kalıcı olarak silinsin mi?',
                    confirmText: 'Sil',
                    danger: true,
                  })
                )
                  deleteMut.mutate();
              }}
            >
              Sil
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Planlanan aracı görüntüler; yetkili kullanıcı (iptal hariç her durumda) değiştirebilir. */
function PlannedVehicleEditor({ asn, canEdit }: { asn: Asn; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();
  const [editing, setEditing] = useState(false);
  const [vehicleId, setVehicleId] = useState(asn.vehicleId ?? '');

  const mut = useMutation({
    mutationFn: () => api.patch<Asn>(`/asn/${asn.id}/vehicle`, { vehicleId: vehicleId || undefined }),
    onSuccess: (updated) => {
      qc.setQueryData(['asn', asn.id], updated);
      qc.invalidateQueries({ queryKey: ['asn'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      setEditing(false);
      toast('Planlanan araç güncellendi');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Güncellenemedi'),
  });

  const current = asn.vehicle
    ? `${asn.vehicle.plate}${asn.vehicle.driverName ? ` · ${asn.vehicle.driverName}` : ''}${asn.vehicle.trailerPlate ? ` · Dorse ${asn.vehicle.trailerPlate}` : ''}`
    : 'Araç belirsiz';

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2">
        <div>
          <p className="text-xs text-slate-400">Planlanan araç</p>
          <p className="text-sm font-medium text-slate-800">🚚 {current}</p>
        </div>
        {canEdit && (
          <Button
            variant="secondary"
            onClick={() => {
              setVehicleId(asn.vehicleId ?? '');
              setEditing(true);
            }}
          >
            Değiştir
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2">
      <Field label="Planlanan araç">
        <Combobox
          options={(vehicles ?? []).map((v) => ({
            value: v.id,
            label: `${v.plate}${v.driverName ? ` - ${v.driverName}` : ''}`,
          }))}
          value={vehicleId}
          onChange={setVehicleId}
          nullable
          placeholder="Plaka ara / seç..."
        />
      </Field>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
          Vazgeç
        </Button>
        <Button className="flex-1" loading={mut.isPending} onClick={() => mut.mutate()}>
          Kaydet
        </Button>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
