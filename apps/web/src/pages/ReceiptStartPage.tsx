import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DISCREPANCY_TYPE_LABELS,
  DISCREPANCY_TYPES,
  KAP_TYPES,
  type DiscrepancyType,
  type Receipt,
  type StartReceiptInput,
  type WaybillExtraction,
} from '@lojistik/shared';
import { clsx } from 'clsx';
import { api, ApiError, uploadFiles, uploadSingle } from '../lib/api';
import { OCR_PROFILE } from '../lib/image';
import { isNativeApp } from '../lib/config';
import { toast } from '../lib/toast';
import { Button, Card, Combobox, Field, Input, Select } from '../components/ui';
import { Icon } from '../components/icons';
import { NativeCamera } from '../components/WaybillCamera';
import { useCustomers, useWarehouses } from '../lib/lookups';

/** Ekrandaki bir kalem satırı. `key` React listesi için; id değil. */
type KapRow = { key: number; type: string; count: string; description: string };

let rowSeq = 0;
const newRow = (): KapRow => ({ key: ++rowSeq, type: 'Palet', count: '', description: '' });

/**
 * Mal Kabul Başlat — uygulamanın GİRİŞ NOKTASI ve teslim alma anının TEK ekranı.
 *
 * Araç depoya gelir, irsaliyesini getirir, depocu kontrol edip malı indirir.
 * Şoför beklediği için ekran tek geçişte bitmeli: gönderici, irsaliye fotoğrafı,
 * gelen kalemler ve gerekirse tutanak burada girilir.
 *
 * Kap ve tutanak kayıt gövdesiyle birlikte gider; sunucu üçünü AYNI
 * transaction'da oluşturur. Fotoğraf multipart olduğu için tek ayrı istek.
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
  // İrsaliye No fotoğraftan okunur; depocu elle yazmakla uğraşmasın diye kilitli
  // açılır. Ama OCR yanlış okuyabilir ve bu numara tesellüm fişine basılıyor —
  // "Düzelt" ile kilit açılabilir (dar OCR'ın kuralı: kullanıcı kaydetmeden kontrol eder).
  const [waybillUnlocked, setWaybillUnlocked] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

  // Depo nadiren değişir: formdan çıkarıldı, üstte ince şeritte durur
  const [whOpen, setWhOpen] = useState(false);

  // --- Gelen yük: bir araçta birden çok cins gelebilir ("5 palet ham madde,
  // 3 varil boya"), bu yüzden mal kabul detayındaki Kalemler gibi çoklu satır ---
  const [rows, setRows] = useState<KapRow[]>([newRow()]);
  const [makeLabels, setMakeLabels] = useState(false);

  const setRow = (i: number, patch: Partial<KapRow>) =>
    setRows((r) => r.map((x, n) => (n === i ? { ...x, ...patch } : x)));

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
   * Kaydı açar. Kap ve tutanak GÖVDEYLE BİRLİKTE gider, sunucuda aynı
   * transaction'da oluşur — eskiden art arda istek zincirleniyordu ve biri
   * sessizce düşünce ortada kalemsiz kayıt kalıyordu.
   *
   * Fotoğraf multipart olduğu için ayrı istek olmak zorunda; başarısız olursa
   * kullanıcıyı geri döndürmek yerine uyarıp detaya götürürüz, orada ekler.
   */
  const startMut = useMutation({
    mutationFn: async (input: StartReceiptInput) => {
      const receipt = await api.post<Receipt>('/receipts/start', input);
      let photoError: string | null = null;
      if (photos.length) {
        try {
          await uploadFiles(`/receipts/${receipt.id}/attachments`, photos);
        } catch (err) {
          photoError = err instanceof ApiError ? err.message : 'Fotoğraflar yüklenemedi';
        }
      }
      return { receipt, photoError };
    },
    onSuccess: ({ receipt, photoError }) => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      if (photoError) toast.error(`Kayıt açıldı ama fotoğraf eklenemedi: ${photoError}`);
      navigate(`/mal-kabul/${receipt.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Başlatılamadı'),
  });

  /**
   * Foto eklenir; İrsaliye No HENÜZ BOŞSA ilk kareden okunmaya çalışılır.
   * Doluysa tekrar okunmaz — hem boşuna OCR çağrısı yapılmaz, hem de doğru
   * okunmuş bir numara sonraki (belki bulanık) kareyle ezilmez.
   */
  const addPhotos = async (files: File[]) => {
    if (!files.length) return;
    setPhotos((p) => [...p, ...files]);
    if (waybillNo.trim()) return;

    setOcrBusy(true);
    try {
      const res = await uploadSingle<WaybillExtraction>(
        '/ocr/waybill',
        files[0],
        'file',
        OCR_PROFILE,
      );
      if (res.waybillNo) {
        setWaybillNo(res.waybillNo);
        toast('İrsaliye No okundu — kontrol edin');
      } else {
        // Okunamadıysa kilidi aç: depocu elle yazabilsin, yoksa mahsur kalır
        setWaybillUnlocked(true);
        toast.error('Numara okunamadı — elle yazabilirsiniz');
      }
    } catch {
      setWaybillUnlocked(true);
      toast.error('Numara okunamadı — elle yazabilirsiniz');
    } finally {
      setOcrBusy(false);
    }
  };
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

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">İrsaliye No</span>
            {!waybillUnlocked && (
              <button
                type="button"
                onClick={() => setWaybillUnlocked(true)}
                className="text-sm font-medium text-brand"
              >
                Düzelt
              </button>
            )}
          </div>
          <Input
            value={waybillNo}
            onChange={(e) => setWaybillNo(e.target.value)}
            disabled={!waybillUnlocked}
            placeholder={ocrBusy ? 'Okunuyor…' : 'Fotoğraftan okunacak'}
            className={clsx(!waybillUnlocked && 'bg-slate-50 text-slate-600')}
          />
        </div>

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
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void addPhotos(files);
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

        {/* Kalemler — mal kabul detayındaki Kalemler kartıyla aynı anatomi */}
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Kalemler</span>
            <Button type="button" variant="secondary" onClick={() => setRows((r) => [...r, newRow()])}>
              + Kalem
            </Button>
          </div>
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                <Select value={row.type} onChange={(e) => setRow(i, { type: e.target.value })}>
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
                  value={row.count}
                  onChange={(e) => setRow(i, { count: e.target.value })}
                  placeholder="Adet"
                />
                <Input
                  className="col-span-2"
                  value={row.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  placeholder="Malın cinsi (opsiyonel)"
                />
              </div>
              {/* Tek satır kalınca silme yok: form hep bir satırla açılır */}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                  className="mt-2 shrink-0 text-slate-400 hover:text-red-600"
                  aria-label="Satırı kaldır"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {/* Karar satır başına DEĞİL kayıt başına: bir kabul ya kap ya kalem
              bazlıdır, karışığı sevkte reddedilir (tek-granülerlik kuralı). */}
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
            // Adet girilmemiş satırlar yok sayılır (boş satır her zaman duruyor)
            const items = rows
              .map((r) => ({
                type: r.type,
                count: Number(r.count),
                description: r.description.trim() || undefined,
              }))
              .filter((r) => r.count > 0);
            startMut.mutate({
              customerId,
              warehouseId,
              recipientCustomerId: recipientCustomerId || undefined,
              waybillNo: waybillNo || undefined,
              kap: items.length ? { items, makeLabels } : undefined,
              discrepancy:
                noteOpen && noteText.trim()
                  ? { type: noteType, description: noteText.trim() }
                  : undefined,
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
            await addPhotos([file]);
            return null;
          }}
        />
      )}
    </div>
  );
}
