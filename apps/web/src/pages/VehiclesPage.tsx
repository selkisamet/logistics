import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createVehicleSchema,
  VEHICLE_TYPE_SUGGESTIONS,
  type CreateVehicleInput,
  type Vehicle,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PhoneInput,
  PlateInput,
  Spinner,
} from '../components/ui';

export function VehiclesPage() {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Araçlar</h2>
        <Button onClick={() => setAdding(true)}>+ Yeni</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !vehicles || vehicles.length === 0 ? (
        <EmptyState title="Araç yok" hint="Plaka/şoför bilgisiyle araç ekleyin." />
      ) : (
        <div className="flex flex-col gap-4">
          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} onEdit={() => setEditing(v)} />
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Yeni Araç" onClose={() => setAdding(false)}>
          <VehicleForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title="Aracı Düzenle" description={editing.plate} onClose={() => setEditing(null)}>
          <VehicleForm
            vehicle={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function VehicleRow({ vehicle, onEdit }: { vehicle: Vehicle; onEdit: () => void }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-semibold text-slate-900">
          {vehicle.plate}
          {!vehicle.isActive && <span className="ml-2 text-xs text-red-500">(pasif)</span>}
        </p>
        <p className="text-xs text-slate-500">
          {vehicle.type}
          {vehicle.driverName ? ` · ${vehicle.driverName}` : ''}
          {vehicle.driverPhone ? ` · ${vehicle.driverPhone}` : ''}
          {vehicle.trailerPlate ? ` · Dorse: ${vehicle.trailerPlate}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge>{vehicle.type}</Badge>
        <button onClick={onEdit} className="text-sm font-medium text-brand">
          Düzenle
        </button>
      </div>
    </Card>
  );
}

function VehicleForm({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle?: Vehicle;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!vehicle;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateVehicleInput & { isActive?: boolean }>({
    resolver: zodResolver(createVehicleSchema),
    defaultValues: vehicle
      ? {
          plate: vehicle.plate,
          type: vehicle.type,
          driverName: vehicle.driverName ?? '',
          driverPhone: vehicle.driverPhone ?? '',
          trailerPlate: vehicle.trailerPlate ?? '',
        }
      : { type: 'Kamyon' },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateVehicleInput) =>
      editing ? api.patch<Vehicle>(`/vehicles/${vehicle!.id}`, input) : api.post<Vehicle>('/vehicles', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      onDone();
      toast(editing ? 'Araç güncellendi' : 'Araç eklendi');
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Plaka *" error={errors.plate?.message}>
            <Controller
              name="plate"
              control={control}
              render={({ field }) => (
                <PlateInput value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
          </Field>
          <Field label="Tip *" error={errors.type?.message}>
            <Input list="vehicle-types" placeholder="Örn. Tır, Kırkayak…" {...register('type')} />
            <datalist id="vehicle-types">
              {VEHICLE_TYPE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Şoför" error={errors.driverName?.message}>
            <Input {...register('driverName')} />
          </Field>
          <Field label="Telefon" error={errors.driverPhone?.message}>
            <Controller
              name="driverPhone"
              control={control}
              render={({ field }) => (
                <PhoneInput value={field.value ?? ''} onChange={field.onChange} />
              )}
            />
          </Field>
        </div>
        <Field label="Dorse Plakası (tır)" error={errors.trailerPlate?.message}>
          <Controller
            name="trailerPlate"
            control={control}
            render={({ field }) => (
              <PlateInput value={field.value ?? ''} onChange={field.onChange} placeholder="34 DR 456" />
            )}
          />
        </Field>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={mutation.isPending}>
          {editing ? 'Güncelle' : 'Kaydet'}
        </Button>
      </div>
    </form>
  );
}
