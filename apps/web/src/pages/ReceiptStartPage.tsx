import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DISCREPANCY_TYPE_LABELS,
  DISCREPANCY_TYPES,
  KAP_TYPES,
  PACKAGE_TYPE_LABELS,
  type DiscrepancyType,
  type Receipt,
  type StartReceiptInput,
} from '@lojistik/shared';
import { api, ApiError, uploadFiles } from '../lib/api';
import { isNativeApp } from '../lib/config';
import { toast } from '../lib/toast';
import { Button, Card, Combobox, Field, Input, Select } from '../components/ui';
import { Icon } from '../components/icons';
import { NativeCamera } from '../components/WaybillCamera';
import { useCustomers, useWarehouses } from '../lib/lookups';

/** Kap etiketinden (Palet/Varil…) QR üretimi için gereken enum'u bulur. */
function packageTypeOf(label: string): string {
  const hit = Object.entries(PACKAGE_TYPE_LABELS).find(([, v]) => v === label);
  return hit?.[0] ?? 'OTHER';
}

/**
 * Mal Kabul Başlat — uygulamanın GİRİŞ NOKTASI ve teslim alma anının TEK ekranı.
 *
 * Araç depoya gelir, irsaliyesini getirir, depocu kontrol edip malı indirir.
 * Şoför beklediği için ekran tek geçişte bitmeli: gönderici, irsaliye fotoğrafı,
 * gelen kap sayısı ve gerekirse tutanak burada girilir.
 *
 * Foto/kap/tutanak bir mal kabul kaydına bağlanır, yani kayıt oluşmadan
 * gönderilemezler — bu yüzden ekranda BİRİKTİRİLİR ve "Başlat"ta sırayla
 * gönderilir. Kayıt önden açılsaydı, vazgeçen her denemeden boş kayıt kalırdı.
 *
 * Burada olmayanlar bilinçli: **yükleme yerini** depocu bilmez, **sipariş no**'yu
 * OCR irsaliye fotoğrafından okur, ticari alanlar (fiyat, ödeme, termin) ofisin işi.
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

  // Depo nadiren değişir: formdan çıkarıldı, üstte ince şeritte durur
  const [whOpen, setWhOpen] = useState(false);

  // --- Gelen kap ---
  const [kap, setKap] = useState<string>('Palet');
  const [kapCount, setKapCount] = useState('');
  const [goods, setGoods] = useState('');
  const [makeLabels, setMakeLabels] = useState(false);

  // --- İrsaliye fotoğrafları (kayıt açılınca yüklenir) ---
  const [photos, setPhotos] = useState<File[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  // --- Tutanak (opsiyonel) ---
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteType, setNoteType] = useState<DiscrepancyType>('DAMAGE');
  const [noteText, setNoteText] = useState('');

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

  /**
   * Kaydı açar, sonra biriken ekleri sırayla gönderir.
   * Ek adımların biri patlarsa kayıt yine de açılmıştır — kullanıcıyı geri
   * döndürmek yerine detay sayfasına götürüp neyin eksik kaldığını söyleriz,
   * orada tamamlayabilir.
   */
  const startMut = useMutation({
    mutationFn: async (input: StartReceiptInput) => {
      const receipt = await api.post<Receipt>('/receipts/start', input);
      const failed: string[] = [];

      if (photos.length) {
        try {
          await uploadFiles(`/receipts/${receipt.id}/attachments`, photos);
        } catch {
          failed.push('fotoğraflar');
        }
      }

      const count = Number(kapCount);
      if (count > 0) {
        try {
          if (makeLabels) {
            await api.post(`/receipts/${receipt.id}/packages`, {
              type: packageTypeOf(kap),
              count,
            });
          } else {
            // QR istenmedi: kalem olarak yazılır. Malın cinsi girilmediyse kap
            // adıyla açılır — depocu irsaliyeyi okuyunca detayda düzeltir.
            await api.patch(`/receipts/${receipt.id}/lines`, {
              description: goods.trim() || kap,
              countedQty: count,
              unit: kap,
            });
          }
        } catch {
          failed.push(makeLabels ? 'QR etiketleri' : 'kalem');
        }
      }

      if (noteOpen && noteText.trim()) {
        try {
          await api.post('/discrepancies', {
            receiptId: receipt.id,
            type: noteType,
            description: noteText.trim(),
          });
        } catch {
          failed.push('tutanak');
        }
      }

      return { receipt, failed };
    },
    onSuccess: ({ receipt, failed }) => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      if (failed.length) toast.error(`Kayıt açıldı ama ${failed.join(', ')} eklenemedi.`);
      navigate(`/mal-kabul/${receipt.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Başlatılamadı'),
  });

  const addPhotos = (files: File[]) => setPhotos((p) => [...p, ...files]);
  const warehouseName = warehouses?.find((w) => w.id === warehouseId)?.name ?? '—';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-slate-500">
          ← Geri
        </button>
        <h2 className="text-xl font-bold text-slate-900">Mal Kabul Başlat</h2>
      </div>

      {/* Depo şeridi — nadiren değişir, forma yer kaplamasın */}
      <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
        <Icon name="home" className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="text-slate-500">Depo:</span>
        {whOpen ? (
          <div className="min-w-0 flex-1">
            <Combobox
              options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setWhOpen(false);
              }}
              placeholder="Depo seç..."
            />
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
              {warehouseName}
            </span>
            <button onClick={() => setWhOpen(true)} className="shrink-0 font-medium text-brand">
              Değiştir
            </button>
          </>
        )}
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
        </div>

        <Field label="İrsaliye No">
          <Input
            value={waybillNo}
            onChange={(e) => setWaybillNo(e.target.value)}
            placeholder="Göndericinin sevk irsaliyesi"
          />
        </Field>

        {/* İrsaliye fotoğrafı — araç beklerken hızlıca çekilsin, kayıtla birlikte yüklenir */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">İrsaliye Fotoğrafı</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => (native ? setCameraOpen(true) : fileRef.current?.click())}
            >
              <Icon name="camera" className="h-4 w-4" /> Çek
            </Button>
          </div>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, x) => x !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-red-600 shadow ring-1 ring-slate-200"
                    aria-label="Kaldır"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gelen kap — "5 palet geldi" */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <span className="text-sm font-medium text-slate-700">Gelen Kap</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select value={kap} onChange={(e) => setKap(e.target.value)}>
              {KAP_TYPES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={kapCount}
              onChange={(e) => setKapCount(e.target.value)}
              placeholder="Adet"
            />
            <Input
              className="col-span-2"
              value={goods}
              onChange={(e) => setGoods(e.target.value)}
              placeholder="Malın cinsi (opsiyonel)"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={makeLabels}
              onChange={(e) => setMakeLabels(e.target.checked)}
            />
            Her kap için QR etiketi üret
          </label>
        </div>

        {/* Tutanak — hasar/eksik varsa aracı bekletmeden yazılsın */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          {noteOpen ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Tutanak</span>
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="text-sm text-slate-500"
                >
                  Vazgeç
                </button>
              </div>
              <Select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value as DiscrepancyType)}
              >
                {DISCREPANCY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DISCREPANCY_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <Input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Ne oldu? (örn. 2 KOLİ EZİK)"
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="flex items-center gap-2 text-sm font-medium text-brand"
            >
              <Icon name="alert" className="h-4 w-4" /> Tutanak ekle
            </button>
          )}
        </div>

        <Button
          className="w-full"
          disabled={!customerId || !warehouseId}
          loading={startMut.isPending}
          onClick={() => {
            setServerError(null);
            startMut.mutate({
              customerId,
              warehouseId,
              recipientCustomerId: recipientCustomerId || undefined,
              waybillNo: waybillNo || undefined,
            });
          }}
        >
          Mal Kabulü Başlat
        </Button>
      </Card>

      {cameraOpen && (
        <NativeCamera
          title="İrsaliye Fotoğrafı"
          guide="İrsaliyenin tamamı kadrajda olsun"
          busyLabel="Alınıyor…"
          onClose={() => setCameraOpen(false)}
          onCapture={async (file) => {
            addPhotos([file]);
            return null;
          }}
        />
      )}
    </div>
  );
}
