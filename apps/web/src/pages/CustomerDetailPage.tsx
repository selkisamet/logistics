import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCustomerLocationSchema,
  createCustomerContactSchema,
  type Customer,
  type CustomerLocation,
  type CustomerContact,
  type CustomerUsage,
  type CreateCustomerLocationInput,
  type CreateCustomerContactInput,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { confirmDialog } from '../lib/dialog';
import { toast } from '../lib/toast';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PhoneInput,
  Spinner,
} from '../components/ui';
import { CustomerForm } from './CustomersPage';
import { useAuthStore } from '../stores/auth';

/** "3 ön ihbar, 2 mal kabul" gibi — neden silinemediğini kullanıcıya açıklar. */
function usageText(u?: CustomerUsage): string {
  if (!u) return '';
  const parts = [
    u.asSender ? `${u.asSender} ön ihbar (gönderici)` : '',
    u.asRecipient ? `${u.asRecipient} ön ihbar (alıcı)` : '',
    u.receipts ? `${u.receipts} mal kabul` : '',
    u.stops ? `${u.stops} sevkiyat durağı` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') + ' kaydı var' : 'geçmiş kaydı yok';
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'ADMIN' || role === 'SUPERVISOR';
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [addingLoc, setAddingLoc] = useState(false);
  const [editingLoc, setEditingLoc] = useState<PartyItem | null>(null);

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
  const { data: contacts } = useQuery({
    queryKey: ['customers', id, 'contacts'],
    queryFn: () => api.get<CustomerContact[]>(`/customers/${id}/contacts`),
    enabled: !!id,
  });
  // Geçmiş kayıt sayıları — "Sil" mi "Pasife Al" mı göstereceğimizi belirler
  const { data: usage } = useQuery({
    queryKey: ['customers', id, 'usage'],
    queryFn: () => api.get<CustomerUsage>(`/customers/${id}/usage`),
    enabled: !!id,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast('Müşteri silindi');
      navigate('/musteriler', { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Silinemedi'),
  });
  const activeMut = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/customers/${id}/active`, { isActive }),
    onSuccess: (_d, isActive) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast(isActive ? 'Müşteri aktife alındı' : 'Müşteri pasife alındı');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Değiştirilemedi'),
  });

  if (isLoading) return <Spinner />;
  if (!customer) return <p className="text-slate-500">Müşteri bulunamadı.</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/musteriler')} className="text-slate-500">
        ← Müşteriler
      </button>

      <Card className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">
            {customer.name}
            {customer.isActive === false && (
              <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                Pasif
              </span>
            )}
          </h2>
          {canEdit && (
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Düzenle
              </Button>
              {/* Geçmişi olan müşteri SİLİNEMEZ (belgeler müşteri bilgisini canlı okur) */}
              {usage?.deletable ? (
                <Button
                  variant="danger"
                  loading={deleteMut.isPending}
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: 'Müşteriyi sil',
                        message: `"${customer.name}" silinsin mi? Bu müşterinin hiç ön ihbar/mal kabul kaydı yok. Yetkili ve lokasyon kayıtları da silinir.`,
                        confirmText: 'Sil',
                        danger: true,
                      })
                    )
                      deleteMut.mutate();
                  }}
                >
                  Sil
                </Button>
              ) : (
                <Button
                  variant={customer.isActive === false ? 'primary' : 'secondary'}
                  loading={activeMut.isPending}
                  onClick={async () => {
                    const toPassive = customer.isActive !== false;
                    if (
                      await confirmDialog({
                        title: toPassive ? 'Pasife al' : 'Aktife al',
                        message: toPassive
                          ? `"${customer.name}" pasife alınsın mı? Listede ve ön ihbar seçiminde görünmez; geçmiş belgeleri korunur. (${usageText(usage)})`
                          : `"${customer.name}" tekrar aktif edilsin mi?`,
                        confirmText: toPassive ? 'Pasife Al' : 'Aktife Al',
                      })
                    )
                      activeMut.mutate(!toPassive);
                  }}
                >
                  {customer.isActive === false ? 'Aktife Al' : 'Pasife Al'}
                </Button>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-slate-500">Kod: {customer.code}</p>
        {(customer.taxOffice || customer.taxNumber) && (
          <p className="text-sm text-slate-600">
            Vergi: {customer.taxOffice ?? '—'}
            {customer.taxNumber ? ` / ${customer.taxNumber}` : ''}
          </p>
        )}
        {customer.phone && <p className="text-sm text-slate-600">Tel: {customer.phone}</p>}
        {customer.email && <p className="text-sm text-slate-600">E-posta: {customer.email}</p>}
        {customer.address && <p className="text-sm text-slate-600">Adres: {customer.address}</p>}
      </Card>

      {editing && (
        <Modal
          title="Müşteriyi Düzenle"
          description={customer.name}
          onClose={() => setEditing(false)}
        >
          <CustomerForm
            initial={customer}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}

      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Yetkililer</h3>
            <p className="text-xs text-slate-500">
              Bu firmadaki ilgili kişiler (ad soyad, görev, telefon, dahili, e-posta).
            </p>
          </div>
          {canEdit && id && (
            <Button className="shrink-0" onClick={() => setAddingContact(true)}>
              + Yeni
            </Button>
          )}
        </div>
        {!contacts || contacts.length === 0 ? (
          <EmptyState title="Henüz yetkili yok" hint="“+ Yeni” ile ekleyebilirsiniz." />
        ) : (
          <div className="flex flex-col gap-4">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                customerId={id!}
                contact={c}
                canEdit={canEdit}
                onEdit={() => setEditingContact(c)}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Depolar / Lokasyonlar</h3>
            <p className="text-xs text-slate-500">
              Bu müşterinin depo/adresleri. Ön ihbarda bu müşteri <b>gönderici</b> ise yükleme yeri,{' '}
              <b>alıcı</b> ise boşaltma yeri olarak buradan seçilir.
            </p>
          </div>
          {canEdit && id && (
            <Button className="shrink-0" onClick={() => setAddingLoc(true)}>
              + Yeni
            </Button>
          )}
        </div>

        {!locations || locations.length === 0 ? (
          <EmptyState title="Henüz lokasyon yok" hint="“+ Yeni” ile ekleyebilirsiniz." />
        ) : (
          <div className="flex flex-col gap-4">
            {locations.map((loc) => (
              <PartyRow
                key={loc.id}
                kind="locations"
                customerId={id!}
                item={loc}
                canEdit={canEdit}
                onEdit={() => setEditingLoc(loc)}
              />
            ))}
          </div>
        )}
      </div>

      {addingContact && id && (
        <Modal title="Yeni Yetkili" description={customer.name} onClose={() => setAddingContact(false)} wide>
          <ContactForm
            customerId={id}
            onDone={() => setAddingContact(false)}
            onCancel={() => setAddingContact(false)}
          />
        </Modal>
      )}
      {editingContact && id && (
        <Modal title="Yetkiliyi Düzenle" description={editingContact.name} onClose={() => setEditingContact(null)} wide>
          <ContactForm
            customerId={id}
            initial={editingContact}
            onDone={() => setEditingContact(null)}
            onCancel={() => setEditingContact(null)}
          />
        </Modal>
      )}
      {addingLoc && id && (
        <Modal title="Yeni Lokasyon" description={customer.name} onClose={() => setAddingLoc(false)} wide>
          <PartyForm
            kind="locations"
            customerId={id}
            onDone={() => setAddingLoc(false)}
            onCancel={() => setAddingLoc(false)}
          />
        </Modal>
      )}
      {editingLoc && id && (
        <Modal title="Lokasyonu Düzenle" description={editingLoc.name} onClose={() => setEditingLoc(null)} wide>
          <PartyForm
            kind="locations"
            customerId={id}
            initial={editingLoc}
            onDone={() => setEditingLoc(null)}
            onCancel={() => setEditingLoc(null)}
          />
        </Modal>
      )}
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
  onCancel,
}: {
  customerId: string;
  kind: PartyKind;
  initial?: PartyItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const meta = PARTY_META[kind];
  const editing = !!initial;
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
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
      onDone();
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
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <PhoneInput value={field.value ?? ''} onChange={field.onChange} placeholder="0216 394 48 33" />
            )}
          />
        </Field>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={mutation.isPending}>
          {editing ? 'Kaydet' : meta.addBtn}
        </Button>
      </div>
    </form>
  );
}

/** Depo/alıcı satırı — görüntüle + düzenle (modal) + sil. */
function PartyRow({
  customerId,
  kind,
  item,
  canEdit,
  onEdit,
}: {
  customerId: string;
  kind: PartyKind;
  item: PartyItem;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.delete(`/customers/${customerId}/${kind}/${item.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', customerId, kind] }),
  });

  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-slate-900">{item.name}</p>
        {item.address && <p className="text-xs text-slate-500">{item.address}</p>}
        {item.phone && <p className="text-xs text-slate-500">Tel: {item.phone}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-3">
          <button onClick={onEdit} className="text-sm font-medium text-brand">
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

/** Yetkili ekle/düzenle formu (ad, görev, telefon, dahili, e-posta). */
function ContactForm({
  customerId,
  initial,
  onDone,
  onCancel,
}: {
  customerId: string;
  initial?: CustomerContact;
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
    control,
    formState: { errors },
  } = useForm<CreateCustomerContactInput>({
    resolver: zodResolver(createCustomerContactSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          role: initial.role ?? '',
          phone: initial.phone ?? '',
          email: initial.email ?? '',
          extension: initial.extension ?? '',
        }
      : undefined,
  });

  const mutation = useMutation({
    mutationFn: (input: CreateCustomerContactInput) =>
      editing
        ? api.patch(`/customers/${customerId}/contacts/${initial!.id}`, input)
        : api.post(`/customers/${customerId}/contacts`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] });
      if (!editing) reset();
      onDone();
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Ad Soyad *" error={errors.name?.message}>
          <Input placeholder="Ali Yılmaz" {...register('name')} />
        </Field>
        <Field label="Görev" error={errors.role?.message}>
          <Input placeholder="Satın Alma" {...register('role')} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Telefon" error={errors.phone?.message}>
          <Controller
            name="phone"
            control={control}
            render={({ field }) => <PhoneInput value={field.value ?? ''} onChange={field.onChange} />}
          />
        </Field>
        <Field label="Dahili" error={errors.extension?.message}>
          <Input placeholder="101" {...register('extension')} />
        </Field>
        <Field label="E-posta" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
      </div>
      {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button type="submit" className="flex-1" loading={mutation.isPending}>
          {editing ? 'Kaydet' : '+ Yetkili Ekle'}
        </Button>
      </div>
    </form>
  );
}

/** Yetkili satırı — görüntüle + düzenle (modal) + sil. */
function ContactRow({
  customerId,
  contact,
  canEdit,
  onEdit,
}: {
  customerId: string;
  contact: CustomerContact;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api.delete(`/customers/${customerId}/contacts/${contact.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] }),
  });

  const meta = [
    contact.phone && `Tel: ${contact.phone}`,
    contact.extension && `Dahili: ${contact.extension}`,
    contact.email,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="flex items-center justify-between gap-2">
      <div>
        <p className="font-medium text-slate-900">
          {contact.name}
          {contact.role ? <span className="text-slate-500"> — {contact.role}</span> : null}
        </p>
        {meta && <p className="text-xs text-slate-500">{meta}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-3">
          <button onClick={onEdit} className="text-sm font-medium text-brand">
            Düzenle
          </button>
          <button
            onClick={async () => {
              if (
                await confirmDialog({
                  message: 'Bu yetkili silinsin mi?',
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
