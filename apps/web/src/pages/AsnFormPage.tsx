import { useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createAsnSchema,
  type CreateAsnInput,
  type Asn,
  type CustomerLocation,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import {
  Button,
  Card,
  Field,
  Input,
  Combobox,
  MultiCombobox,
  Spinner,
  type ComboOption,
} from '../components/ui';
import { useCustomers, useWarehouses, useCustomerLocations, useVehicles } from '../lib/lookups';

const emptyLine = { sku: '', description: '', expectedQty: 1, unit: 'ADET', barcode: '' };

/** ShipmentSource/Recipient seçimini geri (input'a) çevirir. __ft_ = eski serbest metin. */
const selToInput = (o: ComboOption) => ({
  customerLocationId: o.value.startsWith('__ft_') ? undefined : o.value,
  label: o.label,
});

export function AsnFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const editing = !!id;
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const { data: vehicles } = useVehicles();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sourceSel, setSourceSel] = useState<ComboOption[]>([]);
  const [recipientSel, setRecipientSel] = useState<ComboOption[]>([]);

  // Düzenleme: mevcut ön ihbarı yükle
  const { data: existing } = useQuery({
    queryKey: ['asn', id],
    queryFn: () => api.get<Asn>(`/asn/${id}`),
    enabled: editing,
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateAsnInput>({
    resolver: zodResolver(createAsnSchema),
    defaultValues: {
      lines: [{ ...emptyLine }],
      expectedAt: new Date().toISOString().slice(0, 10), // bugün (yyyy-mm-dd)
      paymentType: 'RECIPIENT', // varsayılan: alıcı ödemeli
      showAmountOnSlip: false,
      vatIncluded: false,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const customerId = watch('customerId'); // gönderici müşteri
  const recipientCustomerId = watch('recipientCustomerId'); // alıcı müşteri
  const paymentType = watch('paymentType');
  const { data: locations } = useCustomerLocations(customerId); // göndericinin yükleme yerleri
  const { data: dropLocations } = useCustomerLocations(recipientCustomerId); // alıcının boşaltma yerleri

  // Yeni ön ihbarda varsayılan depoyu ön-seç (kullanıcı isterse değiştirir).
  const whPrefilled = useRef(false);
  useEffect(() => {
    if (editing || whPrefilled.current || !warehouses) return;
    const def = warehouses.find((w) => w.isDefault);
    if (def && !getValues('warehouseId')) {
      whPrefilled.current = true;
      setValue('warehouseId', def.id);
    }
  }, [warehouses, editing, getValues, setValue]);

  // Düzenlemede formu bir kez mevcut kayıttan doldur.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!existing || prefilled.current) return;
    prefilled.current = true;
    reset({
      customerId: existing.customerId,
      recipientCustomerId: existing.recipientCustomerId ?? undefined,
      warehouseId: existing.warehouseId,
      vehicleId: existing.vehicleId ?? undefined,
      expectedAt: existing.expectedAt ? existing.expectedAt.slice(0, 10) : undefined,
      notes: existing.notes ?? undefined,
      paymentType: existing.paymentType ?? 'RECIPIENT',
      showAmountOnSlip: existing.showAmountOnSlip ?? false,
      vatIncluded: existing.vatIncluded ?? false,
      lines: existing.lines.map((l) => ({
        sku: l.sku ?? '',
        description: l.description,
        expectedQty: l.expectedQty,
        unit: l.unit,
        barcode: l.barcode ?? '',
        unitPrice: l.unitPrice ?? undefined,
      })),
    });
    setSourceSel(
      existing.sources.map((s, i) => ({ value: s.customerLocationId || `__ft_${i}`, label: s.label })),
    );
    setRecipientSel(
      existing.recipients.map((r, i) => ({
        value: r.customerLocationId || `__ft_${i}`,
        label: r.label,
      })),
    );
  }, [existing, reset]);

  // Listede yoksa: yazılan adı ilgili müşteriye lokasyon olarak kaydedip seçime ekle.
  const createLocationFor = (ownerId: string | undefined) => async (name: string): Promise<ComboOption> => {
    try {
      const loc = await api.post<CustomerLocation>(`/customers/${ownerId}/locations`, { name });
      qc.invalidateQueries({ queryKey: ['customers', ownerId, 'locations'] });
      return { value: loc.id, label: loc.name };
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Lokasyon oluşturulamadı');
      throw err;
    }
  };
  const createSource = createLocationFor(customerId);
  const createDrop = createLocationFor(recipientCustomerId);

  const mutation = useMutation({
    mutationFn: (input: CreateAsnInput) =>
      editing ? api.patch<Asn>(`/asn/${id}`, input) : api.post<Asn>('/asn', input),
    onSuccess: (asn) => {
      qc.invalidateQueries({ queryKey: ['asn'] });
      navigate(`/on-ihbar/${asn.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  if (editing && !existing) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">
          {editing ? 'Ön İhbar Düzenle' : 'Yeni Ön İhbar'}
        </h2>
      </div>

      <form
        onSubmit={handleSubmit((v) =>
          mutation.mutate({
            ...v,
            sources: sourceSel.map(selToInput),
            recipients: recipientSel.map(selToInput),
          }),
        )}
        className="space-y-4"
      >
        <Card className="space-y-3">
          {/* Hedef depo — malın hangi depoda depolanacağı, önce belirlenir */}
          <Field label="Hedef Depo *" error={errors.warehouseId?.message}>
            <Controller
              name="warehouseId"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={(warehouses ?? []).map((w) => ({
                    value: w.id,
                    label: w.name,
                    hint: `(${w.code})`,
                  }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Depo ara / seç..."
                />
              )}
            />
          </Field>

          {/* Gönderici & Alıcı — ikisi de kayıtlı Müşteri */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Gönderici (Müşteri) *" error={errors.customerId?.message}>
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <Combobox
                    options={(customers ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                      hint: `(${c.code})`,
                    }))}
                    value={field.value ?? ''}
                    onChange={(v) => {
                      field.onChange(v);
                      setSourceSel([]);
                    }}
                    placeholder="Gönderici müşteri ara / seç..."
                  />
                )}
              />
            </Field>
            <Field label="Alıcı (Müşteri)" error={errors.recipientCustomerId?.message}>
              <Controller
                name="recipientCustomerId"
                control={control}
                render={({ field }) => (
                  <Combobox
                    options={(customers ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                      hint: `(${c.code})`,
                    }))}
                    value={field.value ?? ''}
                    onChange={(v) => {
                      field.onChange(v);
                      setRecipientSel([]);
                    }}
                    nullable
                    nullableLabel="Alıcı seçilmedi"
                    placeholder="Alıcı müşteri ara / seç..."
                  />
                )}
              />
            </Field>
          </div>

          {/* Yükleme Yeri (göndericinin) & Boşaltma Yeri (alıcının) — çoklu, listede yoksa oluştur */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Yükleme Yeri</span>
              <MultiCombobox
                options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
                value={sourceSel}
                onChange={setSourceSel}
                onCreate={customerId ? createSource : undefined}
                disabled={!customerId}
                placeholder={customerId ? 'Yükleme yeri seç / yaz…' : 'Önce gönderici seçin'}
                emptyHint="Yazıp “oluştur” ile ekleyin"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Boşaltma Yeri</span>
              <MultiCombobox
                options={(dropLocations ?? []).map((l) => ({ value: l.id, label: l.name }))}
                value={recipientSel}
                onChange={setRecipientSel}
                onCreate={recipientCustomerId ? createDrop : undefined}
                disabled={!recipientCustomerId}
                placeholder={recipientCustomerId ? 'Boşaltma yeri seç / yaz…' : 'Önce alıcı seçin'}
                emptyHint="Yazıp “oluştur” ile ekleyin"
              />
            </div>
          </div>

          {/* Yükleme/teslimat adresi seçilen kaynak/alıcıdan otomatik alınır. */}
          <p className="text-xs text-slate-500">
            Yükleme/boşaltma adresi seçilen <b>yerlerin</b> adresinden otomatik alınır; fişte öyle görünür.
            (Adresleri müşteri detayından güncelleyebilirsiniz.)
          </p>

          {/* Ödeme & KDV */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Ödeme</span>
              <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700">
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" value="RECIPIENT" {...register('paymentType')} /> Alıcı ödemeli
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input type="radio" value="SENDER" {...register('paymentType')} /> Gönderici ödemeli
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Ücret / KDV</span>
              <div className="flex flex-col gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" {...register('vatIncluded')} /> Fiyatlar KDV dahil (değilse %20 eklenir)
                </label>
                <label
                  className={
                    'inline-flex items-center gap-1.5 ' +
                    (paymentType !== 'SENDER' ? 'text-slate-400' : '')
                  }
                >
                  <input
                    type="checkbox"
                    disabled={paymentType !== 'SENDER'}
                    {...register('showAmountOnSlip')}
                  />{' '}
                  Ücreti fişte göster (gönderici ödemeli)
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Araç / Plaka (opsiyonel)" error={errors.vehicleId?.message}>
              <Controller
                name="vehicleId"
                control={control}
                render={({ field }) => (
                  <Combobox
                    options={(vehicles ?? []).map((v) => ({
                      value: v.id,
                      label: `${v.plate}${v.driverName ? ` - ${v.driverName}` : ''}`,
                    }))}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    nullable
                    placeholder="Plaka ara / seç..."
                  />
                )}
              />
            </Field>
            <Field label="Beklenen Tarih" error={errors.expectedAt?.message}>
              <Input type="date" {...register('expectedAt')} />
            </Field>
          </div>

          <Field label="Notlar" error={errors.notes?.message}>
            <Input {...register('notes')} />
          </Field>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Kalemler</h3>
            <Button type="button" variant="secondary" onClick={() => append({ ...emptyLine })}>
              + Satır
            </Button>
          </div>
          {errors.lines?.message && <p className="text-sm text-red-600">{errors.lines.message}</p>}

          {fields.map((field, i) => (
            <div key={field.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Kalem {i + 1}</span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-xs font-medium text-red-600"
                  >
                    Sil
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field
                  label="Açıklama *"
                  error={errors.lines?.[i]?.description?.message}
                >
                  <Input placeholder="Örn. Muhtelif palet" {...register(`lines.${i}.description`)} />
                </Field>
                <Field label="Adet *" error={errors.lines?.[i]?.expectedQty?.message}>
                  <Input type="number" min={1} {...register(`lines.${i}.expectedQty`)} />
                </Field>
                <Field label="Birim Fiyat (₺)" error={errors.lines?.[i]?.unitPrice?.message}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    {...register(`lines.${i}.unitPrice`)}
                  />
                </Field>
              </div>
            </div>
          ))}
        </Card>

        {serverError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
        )}

        <Button type="submit" className="w-full" loading={mutation.isPending}>
          {editing ? 'Güncelle' : 'Ön İhbarı Kaydet'}
        </Button>
      </form>
    </div>
  );
}
