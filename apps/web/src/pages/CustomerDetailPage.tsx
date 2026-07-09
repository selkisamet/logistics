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
import { confirmDialog } from '../lib/dialog';
import { Button, Card, EmptyState, Field, Input, Spinner } from '../components/ui';
import { CustomerForm } from './CustomersPage';
import { useAuthStore } from '../stores/auth';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';
  const [editing, setEditing] = useState(false);

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

      {editing ? (
        <CustomerForm initial={customer} onDone={() => setEditing(false)} />
      ) : (
        <Card className="space-y-1">
          <div className="flex items-start justify-between">
            <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
            {canEdit && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Düzenle
              </Button>
            )}
          </div>
          <p className="text-sm text-slate-500">Kod: {customer.code}</p>
          {customer.contactName && (
            <p className="text-sm text-slate-600">Yetkili: {customer.contactName}</p>
          )}
          {customer.phone && <p className="text-sm text-slate-600">Tel: {customer.phone}</p>}
          {customer.email && <p className="text-sm text-slate-600">E-posta: {customer.email}</p>}
          {customer.address && <p className="text-sm text-slate-600">Adres: {customer.address}</p>}
        </Card>
      )}

      <div>
        <h3 className="mb-2 font-semibold text-slate-900">Depolar / Lokasyonlar</h3>
        <p className="mb-3 text-xs text-slate-500">
          Bu müşterinin depo/adresleri. Ön ihbarda bu müşteri <b>gönderici</b> ise yükleme yeri,{' '}
          <b>alıcı</b> ise boşaltma yeri olarak buradan seçilir.
        </p>

        {canEdit && id && (
          <Card className="mb-3">
            <PartyForm kind="locations" customerId={id} />
          </Card>
        )}

        {!locations || locations.length === 0 ? (
          <EmptyState title="Henüz lokasyon yok" hint="Yukarıdan ekleyebilirsiniz." />
        ) : (
          <div className="flex flex-col gap-4">
            {locations.map((loc) => (
              <PartyRow key={loc.id} kind="locations" customerId={id!} item={loc} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type PartyKind = 'locations' | 'recipients';
type PartyItem = { id: string; name: string; address: string | null; phone?: string | null };

const PARTY_META: Record<
  PartyKind,
  { nameLabel: string; namePh: string; addrPh: string; addBtn: string; delMsg: string }
> = {
  locations: {
    nameLabel: 'Lokasyon Adı',
    namePh: 'Gebze Deposu / Fabrika',
    addrPh: 'Gebze OSB ...',
    addBtn: '+ Lokasyon Ekle',
    delMsg: 'Bu lokasyon silinsin mi?',
  },
  recipients: {
    nameLabel: 'Alıcı Adı',
    namePh: 'X Market',
    addrPh: 'İzmit ...',
    addBtn: '+ Alıcı Ekle',
    delMsg: 'Bu alıcı silinsin mi?',
  },
};

/** Depo veya alıcı ekle/düzenle formu (aynı yapı: ad + adres + telefon). */
function PartyForm({
  customerId,
  kind,
  initial,
  onDone,
}: {
  customerId: string;
  kind: PartyKind;
  initial?: PartyItem;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const meta = PARTY_META[kind];
  const editing = !!initial;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCustomerLocationInput>({
    resolver: zodResolver(createCustomerLocationSchema),
    defaultValues: initial
      ? { name: initial.name, address: initial.address ?? '', phone: initial.phone ?? '' }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateCustomerLocationInput) =>
      editing
        ? api.patch(`/customers/${customerId}/${kind}/${initial!.id}`, input)
        : api.post(`/customers/${customerId}/${kind}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', customerId, kind] });
      if (!editing) reset();
      onDone?.();
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label={`${meta.nameLabel} *`} error={errors.name?.message}>
          <Input placeholder={meta.namePh} {...register('name')} />
        </Field>
        <Field label="Adres" error={errors.address?.message}>
          <Input placeholder={meta.addrPh} {...register('address')} />
        </Field>
        <Field label="Telefon" error={errors.phone?.message}>
          <Input placeholder="0212 000 00 00" {...register('phone')} />
        </Field>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={mutation.isPending}>
          {editing ? 'Kaydet' : meta.addBtn}
        </Button>
        {editing && (
          <Button type="button" variant="secondary" onClick={onDone}>
            Vazgeç
          </Button>
        )}
      </div>
    </form>
  );
}

/** Depo/alıcı satırı — görüntüle + inline düzenle + sil. */
function PartyRow({
  customerId,
  kind,
  item,
  canEdit,
}: {
  customerId: string;
  kind: PartyKind;
  item: PartyItem;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const del = useMutation({
    mutationFn: () => api.delete(`/customers/${customerId}/${kind}/${item.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', customerId, kind] }),
  });

  if (editing) {
    return (
      <Card>
        <PartyForm
          customerId={customerId}
          kind={kind}
          initial={item}
          onDone={() => setEditing(false)}
        />
      </Card>
    );
  }

  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-slate-900">{item.name}</p>
        {item.address && <p className="text-xs text-slate-500">{item.address}</p>}
        {item.phone && <p className="text-xs text-slate-500">Tel: {item.phone}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-3">
          <button onClick={() => setEditing(true)} className="text-sm font-medium text-brand">
            Düzenle
          </button>
          <button
            onClick={async () => {
              if (
                await confirmDialog({
                  message: PARTY_META[kind].delMsg,
                  confirmText: 'Sil',
                  danger: true,
                })
              )
                del.mutate();
            }}
            className="text-sm font-medium text-red-600"
          >
            Sil
          </button>
        </div>
      )}
    </Card>
  );
}
