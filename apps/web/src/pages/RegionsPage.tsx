import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PENDING_REGION_LABEL, type Region } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { useRegions } from '../lib/lookups';
import { Button, Card, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';

/**
 * Depo bölgeleri — malın depoda nereye konacağını belirler (gideceği sevk bölgesine göre).
 * "BEKLEYEN" kayıt değildir: bölgesi bilinmeyen her mal oradadır.
 */
export function RegionsPage() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const { data: regions, isLoading } = useRegions({ includeInactive: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Bölgeler</h2>
          <p className="text-sm text-slate-500">
            Mal depoda gideceği bölgenin alanına konur. Bölgesi belli olmayan mal{' '}
            <b>{PENDING_REGION_LABEL}</b> alanında bekler.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>+ Yeni</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !regions || regions.length === 0 ? (
        <EmptyState
          title="Bölge yok"
          hint="Depodaki sevk alanlarını ekleyin (ör. GEBZE, AVRUPA YAKASI, ÇORLU)."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {regions.map((r) => (
            <Card key={r.id} className="flex items-center justify-between">
              <p className="font-semibold text-slate-900">
                {r.name}
                {!r.isActive && <span className="ml-2 text-xs text-red-500">(pasif)</span>}
              </p>
              <button onClick={() => setEditing(r)} className="text-sm font-medium text-brand">
                Düzenle
              </button>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Yeni Bölge" onClose={() => setAdding(false)}>
          <RegionForm nextOrder={regions?.length ?? 0} onDone={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Bölgeyi Düzenle" description={editing.name} onClose={() => setEditing(null)}>
          <RegionForm region={editing} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}

function RegionForm({
  region,
  nextOrder = 0,
  onDone,
}: {
  region?: Region;
  nextOrder?: number;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(region?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(region?.sortOrder ?? nextOrder));
  const [isActive, setIsActive] = useState(region?.isActive ?? true);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['regions'] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi');

  const save = useMutation({
    mutationFn: () => {
      const body = { name, sortOrder: Number(sortOrder) || 0 };
      return region
        ? api.patch<Region>(`/regions/${region.id}`, { ...body, isActive })
        : api.post<Region>('/regions', body);
    },
    onSuccess: () => {
      invalidate();
      toast(region ? 'Bölge güncellendi' : 'Bölge eklendi');
      onDone();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/regions/${region!.id}`),
    onSuccess: () => {
      invalidate();
      toast('Bölge silindi');
      onDone();
    },
    onError,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Field label="Bölge adı *">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. GEBZE"
              autoFocus
            />
          </Field>
        </div>
        <Field label="Sıra">
          <Input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </div>
      {region && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Aktif (pasif bölge seçim listelerinde çıkmaz)
        </label>
      )}
      <div className="flex gap-2 pt-1">
        {region && (
          <Button
            type="button"
            variant="secondary"
            loading={remove.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  message: `${region.name} silinsin mi? Kullanılmışsa silinemez, pasife alabilirsiniz.`,
                  confirmText: 'Sil',
                  danger: true,
                })
              )
                remove.mutate();
            }}
          >
            Sil
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={save.isPending} disabled={name.trim().length < 2}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
