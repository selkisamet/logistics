import { useEffect, useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  createAsnSchema,
  type CreateAsnInput,
  type Asn,
  type CustomerLocation,
  type CustomerRecipient,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { Button, Card, Field, Input, Combobox, MultiCombobox, type ComboOption } from '../components/ui';
import {
  useCustomers,
  useWarehouses,
  useCustomerLocations,
  useCustomerRecipients,
  useVehicles,
} from '../lib/lookups';

const emptyLine = { sku: '', description: '', expectedQty: 1, unit: 'ADET', barcode: '' };

export function AsnFormPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const { data: vehicles } = useVehicles();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sourceSel, setSourceSel] = useState<ComboOption[]>([]);
  const [recipientSel, setRecipientSel] = useState<ComboOption[]>([]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<CreateAsnInput>({
    resolver: zodResolver(createAsnSchema),
    defaultValues: {
      lines: [{ ...emptyLine }],
      expectedAt: new Date().toISOString().slice(0, 10), // bugün (yyyy-mm-dd)
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const customerId = watch('customerId');
  const { data: locations } = useCustomerLocations(customerId);
  const { data: recipientOptions } = useCustomerRecipients(customerId);

  // Müşteri değişince önceki müşteriye ait seçili kaynak/alıcılar geçersiz olur → temizle.
  useEffect(() => {
    setSourceSel([]);
    setRecipientSel([]);
  }, [customerId]);

  // Listede yoksa: yazılan adı kalıcı kayda çevirip seçime ekle (bir dahaki sefere listede çıkar).
  const createSource = async (name: string): Promise<ComboOption> => {
    try {
      const loc = await api.post<CustomerLocation>(`/customers/${customerId}/locations`, { name });
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'locations'] });
      return { value: loc.id, label: loc.name };
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Depo oluşturulamadı');
      throw err;
    }
  };
  const createRecipient = async (name: string): Promise<ComboOption> => {
    try {
      const rec = await api.post<CustomerRecipient>(`/customers/${customerId}/recipients`, { name });
      qc.invalidateQueries({ queryKey: ['customers', customerId, 'recipients'] });
      return { value: rec.id, label: rec.name };
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Alıcı oluşturulamadı');
      throw err;
    }
  };

  const mutation = useMutation({
    mutationFn: (input: CreateAsnInput) => api.post<Asn>('/asn', input),
    onSuccess: (asn) => {
      qc.invalidateQueries({ queryKey: ['asn'] });
      navigate(`/on-ihbar/${asn.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Yeni Ön İhbar</h2>
      </div>

      <form
        onSubmit={handleSubmit((v) =>
          mutation.mutate({
            ...v,
            sources: sourceSel.map((o) => ({ customerLocationId: o.value, label: o.label })),
            recipients: recipientSel.map((o) => ({ customerRecipientId: o.value, label: o.label })),
          }),
        )}
        className="space-y-4"
      >
        <Card className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Müşteri *" error={errors.customerId?.message}>
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
                    onChange={field.onChange}
                    placeholder="Müşteri ara / seç..."
                  />
                )}
              />
            </Field>
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
          </div>

          {/* Kaynak & Alıcı — çoklu seçim + listede yoksa anında oluştur */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Kaynak (alınacak yer)</span>
              <MultiCombobox
                options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
                value={sourceSel}
                onChange={setSourceSel}
                onCreate={customerId ? createSource : undefined}
                disabled={!customerId}
                placeholder={customerId ? 'Depo seç / yaz…' : 'Önce müşteri seçin'}
                emptyHint="Yazıp “oluştur” ile ekleyin"
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Alıcı (gönderilecek taraf)</span>
              <MultiCombobox
                options={(recipientOptions ?? []).map((r) => ({ value: r.id, label: r.name }))}
                value={recipientSel}
                onChange={setRecipientSel}
                onCreate={customerId ? createRecipient : undefined}
                disabled={!customerId}
                placeholder={customerId ? 'Alıcı seç / yaz…' : 'Önce müşteri seçin'}
                emptyHint="Yazıp “oluştur” ile ekleyin"
              />
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
              </div>
            </div>
          ))}
        </Card>

        {serverError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
        )}

        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Ön İhbarı Kaydet
        </Button>
      </form>
    </div>
  );
}
