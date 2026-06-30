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
import { Badge, Button, Card, EmptyState, Field, Input, PlateInput, Spinner } from '../components/ui';

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Araçlar</h2>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
          {showForm ? 'Kapat' : '+ Yeni'}
        </Button>
      </div>

      {showForm && <VehicleForm onDone={() => setShowForm(false)} />}

      {isLoading ? (
        <Spinner />
      ) : !vehicles || vehicles.length === 0 ? (
        <EmptyState title="Araç yok" hint="Plaka/şoför bilgisiyle araç ekleyin." />
      ) : (
        <div className="flex flex-col gap-4">
          {vehicles.map((v) => (
            <VehicleRow key={v.id} vehicle={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function VehicleRow({ vehicle }: { vehicle: Vehicle }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
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
          <button onClick={() => setOpen((v) => !v)} className="text-sm font-medium text-brand">
            {open ? 'Kapat' : 'Düzenle'}
          </button>
        </div>
      </div>
      {open && <VehicleForm vehicle={vehicle} onDone={() => setOpen(false)} />}
    </Card>
  );
}

function VehicleForm({ vehicle, onDone }: { vehicle?: Vehicle; onDone: () => void }) {
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
    <div className={editing ? 'border-t border-slate-100 pt-2' : ''}>
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
            <Input {...register('driverPhone')} />
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
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          {editing ? 'Güncelle' : 'Kaydet'}
        </Button>
      </form>
    </div>
  );
}
