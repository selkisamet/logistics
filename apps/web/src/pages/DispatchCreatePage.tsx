import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createDispatchSchema, type CreateDispatchInput, type Dispatch } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, Field, Input, PlateInput, Select } from '../components/ui';
import { useVehicles } from '../lib/lookups';

export function DispatchCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateDispatchInput>({ resolver: zodResolver(createDispatchSchema) });

  const mutation = useMutation({
    mutationFn: (input: CreateDispatchInput) => api.post<Dispatch>('/dispatches', input),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      navigate(`/sevkiyat/${d.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Oluşturulamadı'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Yeni Sevkiyat</h2>
      </div>

      <Card>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
          <Field label="Hedef / Alıcı *" error={errors.destination?.message}>
            <Input placeholder="Örn. X Market - İzmit" {...register('destination')} />
          </Field>
          <Field label="Kayıtlı Araç (opsiyonel)" error={errors.vehicleId?.message}>
            <Select {...register('vehicleId')} defaultValue="">
              <option value="">Seçilmedi (elle plaka gir)</option>
              {vehicles?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}
                  {v.driverName ? ` - ${v.driverName}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="veya Plaka (elle)" error={errors.vehiclePlate?.message}>
              <Controller
                name="vehiclePlate"
                control={control}
                render={({ field }) => (
                  <PlateInput value={field.value ?? ''} onChange={field.onChange} />
                )}
              />
            </Field>
            <Field label="Sürücü (elle)" error={errors.driverName?.message}>
              <Input {...register('driverName')} />
            </Field>
          </div>
          <Field label="Notlar" error={errors.notes?.message}>
            <Input {...register('notes')} />
          </Field>
          {serverError && <p className="text-sm text-red-600">{serverError}</p>}
          <Button type="submit" className="w-full" loading={mutation.isPending}>
            Oluştur ve Devam Et
          </Button>
        </form>
      </Card>

      <p className="px-1 text-xs text-slate-500">
        Oluşturduktan sonra depodaki kayıtları ekleyip (ya da palet QR okutup) "Sevk Et" diyeceksiniz.
      </p>
    </div>
  );
}
