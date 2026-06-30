import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  createAsnSchema,
  type CreateAsnInput,
  type Asn,
  type ShipmentSourceInput,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, Field, Input, Select } from '../components/ui';
import {
  useCustomers,
  useWarehouses,
  useCustomerLocations,
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
  const [sources, setSources] = useState<ShipmentSourceInput[]>([]);
  const [freeText, setFreeText] = useState('');

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

  const toggleLocation = (locId: string, name: string) => {
    setSources((prev) =>
      prev.some((s) => s.customerLocationId === locId)
        ? prev.filter((s) => s.customerLocationId !== locId)
        : [...prev, { customerLocationId: locId, label: name }],
    );
  };
  const addFreeText = () => {
    const label = freeText.trim();
    if (!label) return;
    setSources((prev) => [...prev, { label }]);
    setFreeText('');
  };
  const removeSource = (i: number) => setSources((prev) => prev.filter((_, idx) => idx !== i));

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

      <form onSubmit={handleSubmit((v) => mutation.mutate({ ...v, sources }))} className="space-y-4">
        <Card className="space-y-3">
          <p className="text-xs text-slate-400">Referans no otomatik atanır (ON-…).</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Müşteri *" error={errors.customerId?.message}>
              <Select {...register('customerId')} defaultValue="">
                <option value="" disabled>
                  Seçin...
                </option>
                {customers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Hedef Depo *" error={errors.warehouseId?.message}>
              <Select {...register('warehouseId')} defaultValue="">
                <option value="" disabled>
                  Seçin...
                </option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Kaynak (çoklu) */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Kaynak (alınacak yer)</span>
            {!customerId ? (
              <p className="text-xs text-slate-400">Önce müşteri seçin.</p>
            ) : (
              <>
                {locations && locations.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {locations.map((loc) => {
                      const selected = sources.some((s) => s.customerLocationId === loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => toggleLocation(loc.id, loc.name)}
                          className={
                            'rounded-full border px-3 py-1.5 text-sm ' +
                            (selected
                              ? 'border-brand bg-brand text-white'
                              : 'border-slate-300 bg-white text-slate-600')
                          }
                        >
                          {selected ? '✓ ' : ''}
                          {loc.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Bu müşterinin kayıtlı deposu yok.{' '}
                    <Link to={`/musteriler/${customerId}`} className="text-brand underline">
                      Depo ekle
                    </Link>{' '}
                    veya aşağıdan elle girin.
                  </p>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="Elle adres/depo ekle"
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addFreeText();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addFreeText}>
                    Ekle
                  </Button>
                </div>

                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                      >
                        {s.customerLocationId ? '🏭' : '📍'} {s.label}
                        <button
                          type="button"
                          onClick={() => removeSource(i)}
                          className="text-slate-400 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Araç / Plaka (opsiyonel)" error={errors.vehicleId?.message}>
              <Select {...register('vehicleId')} defaultValue="">
                <option value="">Belirsiz / boş</option>
                {vehicles?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                    {v.driverName ? ` - ${v.driverName}` : ''}
                  </option>
                ))}
              </Select>
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
