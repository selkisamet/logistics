import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Receipt, StartReceiptInput } from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { Button, Card, Combobox, Field, Input } from '../components/ui';
import { useCustomers, useWarehouses } from '../lib/lookups';

/**
 * Mal Kabul Başlat — uygulamanın GİRİŞ NOKTASI.
 *
 * Araç depoya gelir, irsaliyesini getirir, depocu kontrol edip malı indirir.
 * Ön ihbar YOK: malın geleceği çoğu zaman önceden bilinmiyor.
 *
 * Depocu yalnız bildiği şeyi girer: gönderici, depo, elindeki irsaliyenin no'su.
 * **ALICI opsiyonel** — gelen irsaliyede nihai firma her zaman yazmıyor.
 * **Yükleme yeri ve sipariş no burada YOK**: ilkini depocu bilmez (ofis
 * "Ticari Bilgiler" kartından girer), ikincisini OCR irsaliye fotoğrafından
 * okuyup Belge Bilgileri'ne yazar.
 */
export function ReceiptStartPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();

  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [recipientCustomerId, setRecipientCustomerId] = useState('');
  const [waybillNo, setWaybillNo] = useState('');

  // Varsayılan depo bir kez ön-seçilir; kullanıcı değiştirdiyse ezmez
  const whPrefilled = useRef(false);
  useEffect(() => {
    if (whPrefilled.current || !warehouses) return;
    const def = warehouses.find((w) => w.isDefault);
    if (def) {
      whPrefilled.current = true;
      setWarehouseId(def.id);
    }
  }, [warehouses]);

  const startMut = useMutation({
    mutationFn: (input: StartReceiptInput) => api.post<Receipt>('/receipts/start', input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      navigate(`/mal-kabul/${r.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Başlatılamadı'),
  });

  const submit = () => {
    setServerError(null);
    startMut.mutate({
      customerId,
      warehouseId,
      recipientCustomerId: recipientCustomerId || undefined,
      waybillNo: waybillNo || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Mal Kabul Başlat</h2>
      </div>

      {serverError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{serverError}</p>
      )}

      <Card className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Gönderici *">
            <Combobox
              options={(customers ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                hint: `(${c.code})`,
              }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Gönderici ara / seç..."
            />
          </Field>
          <Field label="Hedef Depo *">
            <Combobox
              options={(warehouses ?? []).map((w) => ({
                value: w.id,
                label: w.name,
                hint: `(${w.code})`,
              }))}
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Depo ara / seç..."
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Bilinmiyorsa boş bırakılır — irsaliyede nihai firma yazmayabiliyor */}
          <Field label="Alıcı">
            <Combobox
              options={(customers ?? []).map((c) => ({
                value: c.id,
                label: c.name,
                hint: `(${c.code})`,
              }))}
              value={recipientCustomerId}
              onChange={setRecipientCustomerId}
              nullable
              nullableLabel="Bilinmiyor"
              placeholder="Alıcı ara / seç..."
            />
          </Field>
          <Field label="İrsaliye No">
            <Input
              value={waybillNo}
              onChange={(e) => setWaybillNo(e.target.value)}
              placeholder="Göndericinin sevk irsaliyesi"
            />
          </Field>
        </div>

        <Button
          className="w-full"
          disabled={!customerId || !warehouseId}
          loading={startMut.isPending}
          onClick={submit}
        >
          Mal Kabulü Başlat
        </Button>
      </Card>
    </div>
  );
}
