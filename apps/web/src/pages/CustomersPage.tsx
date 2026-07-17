import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomerSchema,
  type CreateCustomerInput,
  type Customer,
  type Paginated,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/auth';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const canEdit = useCanEdit();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', { search }],
    queryFn: () =>
      api.get<Paginated<Customer>>(
        `/customers?page=1&pageSize=50&search=${encodeURIComponent(search)}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900">Müşteriler</h2>
        {canEdit && <Button onClick={() => setAdding(true)}>+ Yeni</Button>}
      </div>

      <Input
        placeholder="Ara: ad veya kod..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Müşteri bulunamadı" hint="Yeni bir müşteri ekleyin." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((c) => (
            <Link key={c.id} to={`/musteriler/${c.id}`}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.code}
                    {c.contactName ? ` · ${c.contactName}` : ''}
                  </p>
                </div>
                <span className="text-slate-300">›</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Yeni Müşteri" onClose={() => setAdding(false)}>
          <CustomerForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </Modal>
      )}
    </div>
  );
}

export function CustomerForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Customer;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          contactName: initial.contactName ?? '',
          phone: initial.phone ?? '',
          email: initial.email ?? '',
          address: initial.address ?? '',
          taxOffice: initial.taxOffice ?? '',
          taxNumber: initial.taxNumber ?? '',
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      editing
        ? api.patch<Customer>(`/customers/${initial!.id}`, input)
        : api.post<Customer>('/customers', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      if (editing) qc.invalidateQueries({ queryKey: ['customers', initial!.id] });
      if (!editing) reset();
      onDone();
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-3">
      <Field label="Ad *" error={errors.name?.message}>
        <Input {...register('name')} placeholder="Örn. Arkem Kimya" />
      </Field>
      {!editing && (
        <p className="text-xs text-slate-400">Müşteri kodu otomatik atanır (MST0001, MST0002…).</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vergi Dairesi" error={errors.taxOffice?.message}>
          <Input {...register('taxOffice')} placeholder="Örn. Sarıyer" />
        </Field>
        <Field label="Vergi No" error={errors.taxNumber?.message}>
          <Input {...register('taxNumber')} placeholder="10 haneli" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Telefon" error={errors.phone?.message}>
          <Input {...register('phone')} />
        </Field>
        <Field label="E-posta" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
      </div>
      <Field label="Adres" error={errors.address?.message}>
        <Input {...register('address')} />
      </Field>
      <p className="text-xs text-slate-400">Yetkili kişileri müşteri detayından ekleyebilirsiniz.</p>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting || mutation.isPending}>
          {editing ? 'Güncelle' : 'Kaydet'}
        </Button>
      </div>
    </form>
  );
}

function useCanEdit() {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'ADMIN' || role === 'SUPERVISOR';
}
