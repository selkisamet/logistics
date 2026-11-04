import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DISCREPANCY_TYPE_LABELS,
  DISCREPANCY_TYPES,
  KAP_TYPES,
  PENDING_REGION_LABEL,
  type Attachment,
  type PickupTask,
  type DiscrepancyType,
  type Receipt,
  type StartReceiptInput,
} from '@lojistik/shared';
import { clsx } from 'clsx';
import { api, ApiError, uploadFiles } from '../lib/api';
import { scanWaybill } from '../lib/docReader';
import { isNativeApp } from '../lib/config';
import { toast } from '../lib/toast';
import { Button, Card, Combobox, Field, Input, Select } from '../components/ui';
import { Icon } from '../components/icons';
import { NativeCamera } from '../components/NativeCamera';
import { ETA_TONE_CLASS, etaLabel } from '../lib/eta';
import {
  useCustomers,
  useOpenPickupTasks,
  useRegions,
  useWarehouses,
} from '../lib/lookups';

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
 * Burada olmayanlar bilinçli: **yükleme yerini** depocu bilmez, ticari alanlar
 * (fiyat, ödeme, termin) ofisin işi. İrsaliye/sipariş no fotoğraftan TELEFONDA
 * okunur (lib/docReader): QR varsa doğrudan yazılır, yoksa adaylardan depocu seçer.
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
  // Gideceği bölge — malın depoda NEREYE konacağı. Boş = BEKLEYEN alanı.
  const [regionId, setRegionId] = useState('');
  const { data: regions } = useRegions();

  // --- Gelen araç: yönetici aracı yüke gönderirken görev açtıysa depocu PLAKAYA
  // dokunur, gönderici/alıcı/bölge dolar. Görev yoksa form her zamanki gibi doldurulur.
  const { data: openTasks } = useOpenPickupTasks();
  const [taskId, setTaskId] = useState('');
  const pickTask = (t: PickupTask | null) => {
    setTaskId(t?.id ?? '');
    setCustomerId(t?.customer.id ?? '');
    setRecipientCustomerId(t?.recipientCustomer?.id ?? '');
    setRegionId(t?.region?.id ?? '');
  };
  const regionName = regions?.find((r) => r.id === regionId)?.name;
  const [waybillNo, setWaybillNo] = useState('');
  const [orderNo, setOrderNo] = useState('');
  // İrsaliye ve sipariş no fotoğraftan okunur; depocu elle yazmakla uğraşmasın
  // diye kilitli açılırlar. QR'dan gelen numara dijitaldir, kilitli kalır;
  // QR yoksa kilit açılır ve depocu aday çiplerden seçer ya da elle yazar.
  // "Düzelt" her zaman kilidi açar. İkisi aynı okumadan geldiği için tek kilit.
  const [docsUnlocked, setDocsUnlocked] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  // Fotoğraftaki metinden çıkan ADAY numaralar — hiçbiri kendiliğinden yazılmaz
  const [chips, setChips] = useState<{ waybill: string[]; order: string[] } | null>(null);

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
  // Hasar fotoğrafları — irsaliye fotoğraflarından ayrı: OCR'a gitmez, tutanağa bağlanır
  const [notePhotos, setNotePhotos] = useState<File[]>([]);
  const [noteCameraOpen, setNoteCameraOpen] = useState(false);
  const noteFileRef = useRef<HTMLInputElement>(null);

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
   *
   * Tutanak fotoğrafları ise kayıttan ÖNCE yüklenir ve id'leri tutanakla birlikte
   * gider — yükleme düşerse kayıt hiç açılmaz, depocu tekrar dener (hasar kanıtı
   * sessizce kaybolmasın).
   */
  const startMut = useMutation({
    mutationFn: async (input: StartReceiptInput) => {
      if (input.discrepancy && notePhotos.length) {
        const uploaded = await uploadFiles<Attachment[]>('/attachments', notePhotos);
        input = {
          ...input,
          discrepancy: { ...input.discrepancy, attachmentIds: uploaded.map((a) => a.id) },
        };
      }
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
      qc.invalidateQueries({ queryKey: ['pickup-tasks'] });
      if (photoError) toast.error(`Kayıt açıldı ama fotoğraf eklenemedi: ${photoError}`);
      navigate(`/mal-kabul/${receipt.id}`, { replace: true });
    },
    onError: (err) => setServerError(err instanceof ApiError ? err.message : 'Başlatılamadı'),
  });

  /**
   * Foto eklenir; numaralar HENÜZ BOŞSA ilk kare telefonda okunur.
   * Doluysa tekrar okunmaz — doğru seçilmiş bir numara sonraki (belki bulanık)
   * karenin adaylarıyla karışmasın.
   *
   * QR → doğrudan yazılır (dijital, hatasız). Metin → yalnız ADAY çip; doğruyu
   * depocu seçer. Hiçbiri yoksa kilit açılır, elle yazılır.
   */
  const addPhotos = async (files: File[]) => {
    if (!files.length) return;
    setPhotos((p) => [...p, ...files]);
    if (waybillNo.trim() || orderNo.trim()) return;

    setOcrBusy(true);
    try {
      const res = await scanWaybill(files[0]);
      if (res.qrWaybillNo) setWaybillNo(res.qrWaybillNo);
      if (res.qrOrderNo) setOrderNo(res.qrOrderNo);
      const waybillChips = res.qrWaybillNo ? [] : res.waybill;
      const orderChips = res.qrOrderNo ? [] : res.order;
      const hasChips = waybillChips.length > 0 || orderChips.length > 0;
      setChips(hasChips ? { waybill: waybillChips, order: orderChips } : null);

      if (res.qrWaybillNo) {
        toast('İrsaliye No karekoddan okundu');
      } else {
        // QR yok: depocu çipten seçsin ya da elle yazsın — kilit engel olmasın
        setDocsUnlocked(true);
        if (hasChips) toast('Fotoğraftaki numaralardan doğru olana dokunun');
        else toast.error('Numara bulunamadı — elle yazabilirsiniz');
      }
    } catch {
      setDocsUnlocked(true);
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

      {/* Yoldaki araçlar — depocu gelen aracın plakasına dokunur. Plaka benzersiz,
          karışmaz; irsaliyeyi önceden görmek gerekmez. */}
      {openTasks && openTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Gelen araç hangisi?</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {openTasks.map((t) => {
              const on = t.id === taskId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTask(on ? null : t)}
                  className={clsx(
                    'shrink-0 rounded-lg border px-3 py-2 text-left transition',
                    on ? 'border-brand bg-brand/5 ring-2 ring-brand/30' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Icon name="truck" className="h-4 w-4" /> {t.vehicle.plate}
                  </span>
                  <span className="block max-w-[11rem] truncate text-xs text-slate-600">
                    {t.customer.name}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <span
                      className={clsx(
                        'rounded px-1.5 text-[11px] font-semibold',
                        t.region ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {t.region?.name ?? PENDING_REGION_LABEL}
                    </span>
                    {t.expectedDate && (
                      <span
                        className={clsx(
                          'rounded px-1.5 text-[11px] font-medium',
                          ETA_TONE_CLASS[etaLabel(t.expectedDate, t.expectedTime).tone],
                        )}
                      >
                        {etaLabel(t.expectedDate, t.expectedTime).text}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

        {/* Depocunun asıl sorusu: "bunu nereye koyayım?" — cevap büyük yazılır */}
        <div
          className={clsx(
            'flex flex-wrap items-center gap-2 rounded-lg px-3 py-2',
            regionName ? 'bg-emerald-50' : 'bg-amber-50',
          )}
        >
          <span className="text-sm text-slate-600">Malı koy:</span>
          <span
            className={clsx(
              'text-base font-bold',
              regionName ? 'text-emerald-800' : 'text-amber-800',
            )}
          >
            {regionName ?? `${PENDING_REGION_LABEL} alanı`}
          </span>
          <Select
            value={regionId}
            onChange={(e) => setRegionId(e.target.value)}
            className="ml-auto w-auto min-w-[10rem] py-1.5"
            aria-label="Bölge"
          >
            <option value="">Bölge bilinmiyor</option>
            {(regions ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Belge Bilgileri</span>
            {!docsUnlocked && (
              <button
                type="button"
                onClick={() => setDocsUnlocked(true)}
                className="text-sm font-medium text-brand"
              >
                Düzelt
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              value={waybillNo}
              onChange={(e) => setWaybillNo(e.target.value)}
              disabled={!docsUnlocked}
              placeholder={ocrBusy ? 'Okunuyor…' : 'İrsaliye No — fotoğraftan'}
              className={clsx(!docsUnlocked && 'bg-slate-50 text-slate-600')}
            />
            <Input
              value={orderNo}
              onChange={(e) => setOrderNo(e.target.value)}
              disabled={!docsUnlocked}
              placeholder={ocrBusy ? 'Okunuyor…' : 'Sipariş No — fotoğraftan'}
              className={clsx(!docsUnlocked && 'bg-slate-50 text-slate-600')}
            />
          </div>
          {chips && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-2.5">
              <NumberChips
                label="İrsaliye No hangisi?"
                options={chips.waybill}
                value={waybillNo}
                onPick={setWaybillNo}
              />
              <NumberChips
                label="Sipariş No hangisi?"
                options={chips.order}
                value={orderNo}
                onPick={setOrderNo}
              />
            </div>
          )}
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
          <PhotoThumbs
            files={photos}
            onRemove={(i) => {
              const next = photos.filter((_, x) => x !== i);
              setPhotos(next);
              // Fotoğraf kalmadıysa ondan çıkan adaylar da gitsin
              if (!next.length) setChips(null);
            }}
          />
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-500">Hasar fotoğrafı</span>
                <input
                  ref={noteFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    setNotePhotos((p) => [...p, ...files]);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    native ? setNoteCameraOpen(true) : noteFileRef.current?.click()
                  }
                >
                  <Icon name="camera" className="h-4 w-4" /> Çek
                </Button>
              </div>
              <PhotoThumbs
                files={notePhotos}
                onRemove={(i) => setNotePhotos((p) => p.filter((_, x) => x !== i))}
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
            // Açıklamasız tutanak kaydedilmez; fotoğraf çekildiyse sessizce düşmesin
            if (noteOpen && !noteText.trim() && notePhotos.length) {
              setServerError('Tutanak fotoğrafı var — "Ne oldu?" açıklamasını yazın');
              return;
            }
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
              // Ekrandaki değer her zaman gönderilir (boş = null): görevden gelen
              // bilgiyi depocu değiştirdiyse sunucu görevdekini geri yazmasın
              recipientCustomerId: recipientCustomerId || null,
              pickupTaskId: taskId || undefined,
              regionId: regionId || null,
              waybillNo: waybillNo || undefined,
              orderNo: orderNo || undefined,
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
          busyLabel="Okunuyor…"
          onClose={() => setCameraOpen(false)}
          onCapture={async (file) => {
            await addPhotos([file]);
            return null;
          }}
        />
      )}

      {noteCameraOpen && (
        <NativeCamera
          title="Hasar Fotoğrafı"
          guide="Hasarlı kısım net görünsün"
          busyLabel="Alınıyor…"
          onClose={() => setNoteCameraOpen(false)}
          onCapture={async (file) => {
            // Kabuk kareyi "irsaliye.jpg" adıyla verir; ekte doğru görünsün
            setNotePhotos((p) => [...p, new File([file], 'hasar.jpg', { type: file.type })]);
            return null;
          }}
        />
      )}
    </div>
  );
}

/**
 * Fotoğraftan çıkan aday numaralar. Dokunulan alana yazılır; seçili çipe tekrar
 * dokunmak seçimi kaldırır (yanlış dokunuş tek hareketle geri alınsın).
 */
function NumberChips({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: string[];
  value: string;
  onPick: (v: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onPick(on ? '' : o)}
              className={clsx(
                'rounded-md border px-2.5 py-1.5 font-mono text-sm transition active:scale-95',
                on
                  ? 'border-brand bg-brand/10 font-semibold text-brand ring-1 ring-brand/30'
                  : 'border-slate-200 bg-white text-slate-800',
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Seçilen fotoğrafların küçük önizlemesi + kaldır düğmesi. */
function PhotoThumbs({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  // Her render'da yeni blob URL üretip sızdırmamak için dosya listesine bağlı
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="relative">
          <img
            src={urls[i]}
            alt={f.name}
            className="h-20 w-20 rounded-lg border border-slate-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs text-red-600 shadow ring-1 ring-slate-200"
            aria-label="Kaldır"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
