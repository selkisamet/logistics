import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerLocationSchema,
  type Customer,
  type CustomerLocation,
  type CreateCustomerLocationInput,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/auth';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => api.get<Customer>(`/customers/${id}`),
    enabled: !!id,
  });
  const { data: locations } = useQuery({
    queryKey: ['customers', id, 'locations'],
    queryFn: () => api.get<CustomerLocation[]>(`/customers/${id}/locations`),
    enabled: !!id,
  });

  if (isLoading) return <Spinner />;
  if (!customer) return <p className="text-slate-500">Müşteri bulunamadı.</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/musteriler')} className="text-slate-500">
        ← Müşteriler
      </button>

      <Card className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
        <p className="text-sm text-slate-500">Kod: {customer.code}</p>
        {customer.contactName && <p className="text-sm text-slate-600">Yetkili: {customer.contactName}</p>}
        {customer.phone && <p className="text-sm text-slate-600">Tel: {customer.phone}</p>}
        {customer.address && <p className="text-sm text-slate-600">Adres: {customer.address}</p>}
      </Card>

      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Kaynak Depolar</h3>
        <p className="mb-3 text-xs text-slate-500">
          Bu müşterinin malının alınacağı depo/adresler. Ön ihbar oluştururken buradan seçilir.
        </p>

        {canEdit && id && <LocationForm customerId={id} />}

        {!locations || locations.length === 0 ? (
          <EmptyState title="Henüz kaynak depo yok" hint="Yukarıdan ekleyebilirsiniz." />
        ) : (
          <div className="flex flex-col gap-4">
            {locations.map((loc) => (
              <LocationRow key={loc.id} customerId={id!} location={loc} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LocationForm({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCustomerLocationInput>({ resolver: zodResolver(createCustomerLocationSchema) });

  const mutation = useMutation({
    mutationFn: (input: CreateCustomerLocationInput) =>
      api.post<CustomerLocation>(`/customers/${customerId}/locations`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'locations'] });
      reset();
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Eklenemedi'),
  });

  return (
    <Card className="mb-3">
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Depo/Lokasyon Adı *" error={errors.name?.message}>
            <Input placeholder="Gebze Deposu" {...register('name')} />
          </Field>
          <Field label="Adres" error={errors.address?.message}>
            <Input placeholder="Gebze OSB ..." {...register('address')} />
          </Field>
        </div>
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <Button type="submit" loading={mutation.isPending}>
          + Depo Ekle
        </Button>
      </form>
    </Card>
  );
}

function LocationRow({
  customerId,
  location,
  canEdit,
}: {
  customerId: string;
  location: CustomerLocation;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.delete(`/customers/${customerId}/locations/${location.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', customerId, 'locations'] }),
  });

  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-slate-900">{location.name}</p>
        {location.address && <p className="text-xs text-slate-500">{location.address}</p>}
      </div>
      {canEdit && (
        <button
          onClick={() => {
            if (confirm('Bu kaynak depo silinsin mi?')) del.mutate();
          }}
          className="text-sm font-medium text-red-600"
        >
          Sil
        </button>
      )}
    </Card>
  );
}
