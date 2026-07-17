import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWarehouseSchema,
  type CreateWarehouseInput,
  type Warehouse,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/auth';

export function WarehousesPage() {
  const [adding, setAdding] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/warehouses'),
  });

  const setDefaultMut = useMutation({
    mutationFn: (id: string) => api.post(`/warehouses/${id}/default`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouses'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Depolar</h2>
        {canEdit && <Button onClick={() => setAdding(true)}>+ Yeni</Button>}
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState title="Depo bulunamadı" hint="Yeni bir depo ekleyin." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.map((w) => (
            <Card key={w.id} className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {w.name}
                  {w.isDefault && (
                    <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      Varsayılan
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">{w.code}</p>
                {w.address && <p className="text-xs text-slate-400">{w.address}</p>}
              </div>
              {canEdit && !w.isDefault && (
                <Button
                  variant="secondary"
                  className="shrink-0"
                  loading={setDefaultMut.isPending && setDefaultMut.variables === w.id}
                  onClick={() => setDefaultMut.mutate(w.id)}
                >
                  Varsayılan yap
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Yeni Depo" onClose={() => setAdding(false)}>
          <WarehouseForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

function WarehouseForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateWarehouseInput>({ resolver: zodResolver(createWarehouseSchema) });

  const mutation = useMutation({
    mutationFn: (input: CreateWarehouseInput) => api.post<Warehouse>('/warehouses', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      reset();
      onDone();
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
      <Field label="Ad *" error={errors.name?.message}>
        <Input {...register('name')} placeholder="Örn. Merkez Depo" />
      </Field>
      <p className="text-xs text-slate-400">Depo kodu addan otomatik üretilir (örn. MERKEZ_DEPO).</p>
      <Field label="Adres" error={errors.address?.message}>
        <Input {...register('address')} />
      </Field>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting || mutation.isPending}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
