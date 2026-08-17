import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  PACKAGE_TYPE_LABELS,
  type Dispatch,
  type DispatchItem,
  type DispatchStop,
  type LoadEntryInput,
  type Paginated,
  type Receipt,
  type PackageType,
  type AddDispatchPackageInput,
  type VehicleSummary,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { formatDate, formatDateTime } from '../lib/format';
import { useCustomerLocations, useCustomers, useVehicles } from '../lib/lookups';
import { Button, Card, Combobox, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { DispatchStatusBadge } from '../components/DispatchStatusBadge';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { WaybillModal } from '../components/print/WaybillForm';

export function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'single' | 'lot'>('single');
  const [vehicleModal, setVehicleModal] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [editingStop, setEditingStop] = useState<DispatchStop | null>(null);
  const [waybillModal, setWaybillModal] = useState(false);
  const [waybillEdit, setWaybillEdit] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const { data: dispatch, isLoading } = useQuery({
    queryKey: ['dispatches', id],
    queryFn: () => api.get<Dispatch>(`/dispatches/${id}`),
    enabled: !!id,
  });

  const setDispatch = (d: Dispatch) => qc.setQueryData(['dispatches', id], d);
  const afterChange = (d: Dispatch) => {
    setDispatch(d);
    qc.invalidateQueries({ queryKey: ['stock'] });
  };

  const addMut = useMutation({
    mutationFn: (body: AddDispatchPackageInput) =>
      api.post<Dispatch>(`/dispatches/${id}/packages`, body),
    onSuccess: (d) => {
      afterChange(d);
      toast(`✓ Palet eklendi (${d.packages.length})`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Eklenemedi'),
  });
  const removeItemMut = useMutation({
    mutationFn: (itemId: string) => api.delete<Dispatch>(`/dispatches/${id}/items/${itemId}`),
    onSuccess: afterChange,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Çıkarılamadı'),
  });
  const addItemsMut = useMutation({
    mutationFn: (items: LoadEntryInput[]) => api.post<Dispatch>(`/dispatches/${id}/items`, { items }),
    onSuccess: (d) => {
      afterChange(d);
      setLoadOpen(false);
      toast('✓ Yük eklendi');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Yük eklenemedi'),
  });
  const completeMut = useMutation({
    mutationFn: () => api.post<Dispatch>(`/dispatches/${id}/complete`),
    onSuccess: (d) => {
      setDispatch(d);
      qc.invalidateQueries({ queryKey: ['dispatches'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Sevk edilemedi'),
  });
  const cancelMut = useMutation({
    mutationFn: () => api.post<Dispatch>(`/dispatches/${id}/cancel`),
    onSuccess: (d) => {
      afterChange(d);
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      toast('Sevkiyat geri alındı; yükler depoya döndü.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'İptal edilemedi'),
  });
  const vehicleMut = useMutation({
    mutationFn: (vehicleId: string) =>
      api.patch<Dispatch>(`/dispatches/${id}/vehicle`, { vehicleId }),
    onSuccess: (d) => {
      setDispatch(d);
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      setVehicleModal(false);
      toast('🚚 Araç güncellendi.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Araç değiştirilemedi'),
  });

  // ---- Duraklar ----
  const stopErr = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback);

  const suggestMut = useMutation({
    mutationFn: () => api.post<Dispatch>(`/dispatches/${id}/stops/suggest`),
    onSuccess: (d) => {
      setDispatch(d);
      toast(`📍 ${d.stops.length} durak hazırlandı.`);
    },
    onError: (e) => stopErr(e, 'Duraklar oluşturulamadı'),
  });
  const removeStopMut = useMutation({
    mutationFn: (stopId: string) => api.delete<Dispatch>(`/dispatches/${id}/stops/${stopId}`),
    onSuccess: setDispatch,
    onError: (e) => stopErr(e, 'Durak silinemedi'),
  });
  const deliverMut = useMutation({
    mutationFn: ({ stopId, delivered }: { stopId: string; delivered: boolean }) =>
      delivered
        ? api.post<Dispatch>(`/dispatches/${id}/stops/${stopId}/deliver`)
        : api.delete<Dispatch>(`/dispatches/${id}/stops/${stopId}/deliver`),
    onSuccess: setDispatch,
    onError: (e) => stopErr(e, 'Teslim durumu değiştirilemedi'),
  });
  // Rota sırası — sürücü bu sırayla gider, irsaliyedeki satır grupları da bu sıraya göre dizilir
  const reorderMut = useMutation({
    mutationFn: (stopIds: string[]) =>
      api.patch<Dispatch>(`/dispatches/${id}/stops/reorder`, { stopIds }),
    onSuccess: setDispatch,
    onError: (e) => stopErr(e, 'Sıra değiştirilemedi'),
  });
  const moveStop = (index: number, dir: -1 | 1) => {
    const ids = (dispatch?.stops ?? []).map((s) => s.id);
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    reorderMut.mutate(ids);
  };

  const assignMut = useMutation({
    mutationFn: ({ stopId, itemIds }: { stopId: string; itemIds: string[] }) =>
      api.patch<Dispatch>(`/dispatches/${id}/stops/${stopId}/assign`, { itemIds }),
    onSuccess: setDispatch,
    onError: (e) => stopErr(e, 'Durak ataması yapılamadı'),
  });
  /** Tüm atamaları sıfırlayıp ön ihbardaki alıcılara göre yeniden kur.
   *  (Elle yanlış atanmış yükleri tek tek düzeltmek yerine.) */
  const reassignMut = useMutation({
    mutationFn: async () => {
      const ids = (dispatch?.items ?? []).map((i) => i.id);
      if (ids.length) await api.patch<Dispatch>(`/dispatches/${id}/stops/yok/assign`, { itemIds: ids });
      return api.post<Dispatch>(`/dispatches/${id}/stops/suggest`);
    },
    onSuccess: (d) => {
      setDispatch(d);
      toast('Yükler ön ihbardaki alıcılara göre yeniden atandı.');
    },
    onError: (e) => stopErr(e, 'Yeniden atanamadı'),
  });

  const editable = dispatch?.status === 'DRAFT';

  if (isLoading) return <Spinner />;
  if (!dispatch) return <p className="text-slate-500">Sevkiyat bulunamadı.</p>;

  const targetVehicleId = dispatch.vehicle?.id ?? null;

  // Başlık/rota için türetilenler
  const plate = dispatch.vehicle?.plate ?? dispatch.vehiclePlate ?? '';
  const driver = dispatch.vehicle?.driverName ?? dispatch.driverName ?? '';
  const trailer = dispatch.vehicle?.trailerPlate ?? '';
  const departure = dispatch.items[0]?.warehouseName ?? ''; // yükün alındığı depo
  // Durak yoksa rota satırında ön ihbardaki alıcıları göster (tekilleştirilmiş)
  const recipientList = [
    ...new Set(dispatch.items.map((i) => i.recipientName).filter(Boolean)),
  ] as string[];

  /** Yük, ön ihbardaki alıcısından FARKLI bir durağa atanmışsa uyar.
   *  (Elle yapılan hatalı atamayı yakalar — irsaliyede yanlış ALICI basılmasını önler.) */
  const stopById = new Map(dispatch.stops.map((s) => [s.id, s]));
  const isMismatched = (i: DispatchItem) => {
    if (!i.stopId || !i.recipientName) return false;
    const sc = stopById.get(i.stopId)?.customerName;
    return !!sc && sc !== i.recipientName;
  };
  const mismatchCount = dispatch.items.filter(isMismatched).length;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/sevkiyat')} className="text-slate-500">
        ← Sevkiyatlar
      </button>

      {/* Başlık "hangi araç, nereden nereye" sorusunu cevaplar. Seferin kimliği ARAÇTIR;
          `destination` uzun bir isim listesine dönüşebildiği için başlıkta kullanılmaz. */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">
              {plate || 'Araç atanmadı'}
              {driver && <span className="ml-2 text-sm font-normal text-slate-500">{driver}</span>}
            </h2>
            <p className="text-xs text-slate-500">
              {dispatch.reference}
              {trailer ? ` · Dorse ${trailer}` : ''}
              {dispatch.dispatchedAt ? ` · Sevk: ${formatDateTime(dispatch.dispatchedAt)}` : ''}
            </p>
          </div>
          <DispatchStatusBadge status={dispatch.status} />
        </div>

        {/* ROTA: çıkış deposu → duraklar (sırayla) */}
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rota</p>
          <p className="mt-0.5 text-sm text-slate-800">
            <span className="font-semibold">{departure || 'Depo'}</span>
            {dispatch.stops.length > 0 ? (
              dispatch.stops.map((s) => (
                <span key={s.id}>
                  <span className="mx-1 text-slate-400">→</span>
                  <span className={s.deliveredAt ? 'text-green-700 line-through' : ''}>
                    {s.seq}. {stopLabel(s)}
                  </span>
                </span>
              ))
            ) : (
              <>
                <span className="mx-1 text-slate-400">→</span>
                <span className="text-slate-500">
                  {recipientList.length ? recipientList.join(' · ') : 'durak belirtilmedi'}
                </span>
              </>
            )}
          </p>
          {dispatch.stops.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">
              {dispatch.stops.length} durak · {loadSummary(dispatch.items)}
            </p>
          )}
        </div>

        {dispatch.notes && (
          <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">{dispatch.notes}</p>
        )}
      </Card>

      {/* Sevk edilmiş sevkiyatta düzeltme. "Geri Al" YIKICI — iri kırmızı buton fazla
          davetkârdı, metin bağlantısına indirildi (onay diyaloğu zaten var). */}
      {dispatch.status === 'DISPATCHED' && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setVehicleModal(true)}>
            🚚 Aracı Değiştir
          </Button>
          <button
            onClick={async () => {
              if (
                await confirmDialog({
                  title: 'Sevkiyatı geri al',
                  message:
                    'Bu sevkiyat geri alınsın mı? Tüm yükler depoya geri döner, sevkiyat İPTAL olur. Doğru araçla tekrar sevk edebilirsiniz.',
                  confirmText: 'Geri Al',
                  danger: true,
                })
              )
                cancelMut.mutate();
            }}
            className="ml-auto text-xs font-medium text-red-600 hover:underline"
          >
            ↩ Sevkiyatı geri al
          </button>
        </div>
      )}

      {vehicleModal && (
        <ChangeVehicleModal
          currentVehicleId={dispatch.vehicle?.id ?? null}
          onClose={() => setVehicleModal(false)}
          onSave={(vid) => vehicleMut.mutate(vid)}
          saving={vehicleMut.isPending}
        />
      )}
      {addingStop && (
        <StopModal
          dispatchId={id!}
          onClose={() => setAddingStop(false)}
          onSaved={(d) => {
            setDispatch(d);
            setAddingStop(false);
          }}
        />
      )}
      {editingStop && (
        <StopModal
          dispatchId={id!}
          stop={editingStop}
          onClose={() => setEditingStop(null)}
          onSaved={(d) => {
            setDispatch(d);
            setEditingStop(null);
          }}
        />
      )}
      {waybillEdit && (
        <WaybillInfoModal
          dispatch={dispatch}
          onClose={() => setWaybillEdit(false)}
          onSaved={(d) => {
            setDispatch(d);
            setWaybillEdit(false);
          }}
        />
      )}
      {waybillModal && <WaybillModal dispatch={dispatch} onClose={() => setWaybillModal(false)} />}
      {loadOpen && (
        <LoadFromStockModal
          stops={dispatch.stops}
          targetVehicleId={targetVehicleId}
          saving={addItemsMut.isPending}
          onClose={() => setLoadOpen(false)}
          onLoad={(entries) => addItemsMut.mutate(entries)}
        />
      )}

      {/* Taslak aksiyonları — asıl yol "Depodan Yük Ekle" (Yüklenen Yük kartında).
          QR okutma etiketli paletler için ikincil kısayol; ayarı da butonun yanında. */}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setScanning(true)}>
            📷 QR Okut
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={scanMode === 'lot'}
              onChange={(e) => setScanMode(e.target.checked ? 'lot' : 'single')}
            />
            QR okutunca paletin girişindeki <b>tüm</b> paletleri ekle
          </label>
          <button
            onClick={async () => {
              if (
                await confirmDialog({
                  message: 'Sevkiyat iptal edilsin mi? Yükler depoya geri döner.',
                  confirmText: 'İptal Et',
                  danger: true,
                })
              )
                cancelMut.mutate();
            }}
            className="ml-auto text-xs font-medium text-red-600"
          >
            Sevkiyatı iptal et
          </button>
        </div>
      )}

      {/* Taşıma İrsaliyesi — matbu belge bilgileri + ücret */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Taşıma İrsaliyesi</h3>
            <p className="text-xs text-slate-500">
              Matbu belgenin seri/sıra numarası ve taşıma ücreti (yasal zorunlu alanlar).
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={() => setWaybillEdit(true)}>
              Bilgileri Gir
            </Button>
            <Button onClick={() => setWaybillModal(true)}>🖨️ İrsaliye</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2 text-sm">
          <span className="text-slate-500">
            Seri/Sıra:{' '}
            <b className="text-slate-800">
              {[dispatch.waybillSerial, dispatch.waybillNo].filter(Boolean).join(' - ') || '—'}
            </b>
          </span>
          <span className="text-slate-500">
            Tarih: <b className="text-slate-800">{formatDate(dispatch.waybillDate) || '—'}</b>
          </span>
          <span className="text-slate-500">
            Ücret:{' '}
            <b className="text-slate-800">
              {dispatch.freightAmount != null
                ? `${dispatch.freightAmount} ₺ (${dispatch.freightVatIncluded ? 'KDV dahil' : 'KDV hariç'})`
                : '—'}
            </b>
          </span>
        </div>
      </Card>

      {/* Duraklar — OPSİYONEL. Alıcı bilgisi ön ihbardan geldiği için irsaliye duraksız da
          doğru basılır; duraklar rota sırası ve teslim takibi içindir. */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">
              Duraklar ({dispatch.stops.length})
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                opsiyonel
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Rota sırası ve teslim takibi için. Alıcılar ön ihbardan geliyor.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {dispatch.stops.length === 0 ? (
              <Button
                variant="secondary"
                loading={suggestMut.isPending}
                onClick={() => suggestMut.mutate()}
              >
                Kabullerden Öner
              </Button>
            ) : (
              // Atamalar bozulduysa tek tıkla ön ihbardaki alıcılara göre kurtar
              <Button
                variant="secondary"
                loading={reassignMut.isPending}
                onClick={async () => {
                  if (
                    await confirmDialog({
                      title: 'Yükleri yeniden ata',
                      message:
                        'Tüm yüklerin durak ataması silinip ön ihbardaki alıcılara göre yeniden kurulacak. Elle yaptığınız atamalar kaybolur. Devam edilsin mi?',
                      confirmText: 'Yeniden Ata',
                    })
                  )
                    reassignMut.mutate();
                }}
              >
                Yükleri Yeniden Ata
              </Button>
            )}
            <Button variant="secondary" onClick={() => setAddingStop(true)}>
              + Durak
            </Button>
          </div>
        </div>
        {dispatch.stops.length === 0 ? (
          <p className="text-xs text-slate-400">
            Durak yok — irsaliyede alıcı olarak ön ihbardaki alıcı yazılır. Rota sırası/teslim takibi
            istiyorsanız "Kabullerden Öner" ile hazırlayabilirsiniz.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {dispatch.stops.map((s, idx) => (
              <div key={s.id} className="flex items-start justify-between gap-3 py-2">
                {/* Rota sırası: ▲▼ (dokunmatikte sürükle-bırak yerine — telefonda güvenilir) */}
                <div className="flex shrink-0 flex-col items-center">
                  <button
                    onClick={() => moveStop(idx, -1)}
                    disabled={idx === 0 || reorderMut.isPending}
                    className="text-xs leading-none text-slate-400 disabled:opacity-25"
                    aria-label="Yukarı taşı"
                  >
                    ▲
                  </button>
                  <span className="my-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {s.seq}
                  </span>
                  <button
                    onClick={() => moveStop(idx, 1)}
                    disabled={idx === dispatch.stops.length - 1 || reorderMut.isPending}
                    className="text-xs leading-none text-slate-400 disabled:opacity-25"
                    aria-label="Aşağı taşı"
                  >
                    ▼
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  {/* Ekranda YER önce (operatörün sorusu "nereye"), altında ALICI FİRMA.
                      İkisi birlikte gösterilir: aynı firmanın birden çok lokasyonu olabilir. */}
                  <p className="text-sm font-medium text-slate-900">
                    {s.name}
                    {s.deliveredAt && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        ✓ Teslim
                      </span>
                    )}
                  </p>
                  {s.customerName && s.customerName !== s.name && (
                    <p className="text-xs font-medium text-slate-600">🏢 {s.customerName}</p>
                  )}
                  {s.address && <p className="text-xs text-slate-500">{s.address}</p>}
                  <p className="text-xs text-slate-400">
                    {stopLoadText(dispatch.items, s.id)}
                    {s.phone ? ` · ${s.phone}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3">
                  <button
                    onClick={() =>
                      deliverMut.mutate({ stopId: s.id, delivered: !s.deliveredAt })
                    }
                    className="text-xs font-medium text-brand"
                  >
                    {s.deliveredAt ? 'Geri al' : 'Teslim'}
                  </button>
                  <button
                    onClick={() => setEditingStop(s)}
                    className="text-xs font-medium text-slate-500"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          message: `"${s.name}" durağı silinsin mi? Yükler sevkiyatta kalır, ataması düşer.`,
                          confirmText: 'Sil',
                          danger: true,
                        })
                      )
                        removeStopMut.mutate(s.id);
                    }}
                    className="text-xs font-medium text-red-600"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Yüklenen yük — defterden (kap + kalem satırları), kabule göre gruplu */}
      <Card className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Yüklenen Yük ({dispatch.items.length})</h3>
            <p className="text-xs text-slate-500">
              {loadSummary(dispatch.items)}
              {dispatch.stops.length > 0
                ? ' · durak sırasına göre dizili'
                : ' · yükleme sırasına göre (teslim sırası için durak ekleyin)'}
            </p>
            {mismatchCount > 0 && (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                ⚠ {mismatchCount} yük, ön ihbardaki alıcısından farklı bir durağa atanmış — irsaliyede
                yanlış ALICI basılır. "Yükleri Yeniden Ata" ile düzeltebilirsiniz.
              </p>
            )}
          </div>
          {editable && (
            <Button className="shrink-0" onClick={() => setLoadOpen(true)}>
              + Depodan Yük Ekle
            </Button>
          )}
        </div>
        {dispatch.items.length === 0 ? (
          <p className="text-xs text-slate-400">
            "Depodan Yük Ekle" ile ürün/palet seçin ya da palet QR okutun.
          </p>
        ) : (
          <div className="space-y-3">
            {sortByStop(groupByReceipt(dispatch.items), dispatch.stops).map((g) => (
              <div key={g.receiptId}>
                {/* Gönderici → Alıcı tek satırda: alıcı ön ihbardan gelir, irsaliyeye o yazılır */}
                <Link to={`/mal-kabul/${g.receiptId}`} className="group block">
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-brand">
                    {g.customerName ?? '—'}
                    {g.recipientName && (
                      <>
                        <span className="mx-1.5 text-slate-400">→</span>
                        {g.recipientName}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {g.receiptReference}
                    {g.waybillNo ? ` · Sevk İrs: ${g.waybillNo}` : ''}
                  </p>
                </Link>
                <div className="divide-y divide-slate-100">
                  {g.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-900">
                          {i.kind === 'PACKAGE' ? (
                            <>
                              <span className="font-medium">{i.packageCode}</span>{' '}
                              <span className="text-slate-500">
                                ({PACKAGE_TYPE_LABELS[i.unit as PackageType] ?? i.unit})
                              </span>
                            </>
                          ) : (
                            <>
                              {i.description}{' '}
                              <span className="font-medium">
                                {i.qty} {i.unit}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                      {/* Bu yük hangi durakta inecek — irsaliyedeki ALICI ve sıra bundan gelir */}
                      {dispatch.stops.length > 0 && (
                        <label className="flex shrink-0 items-center gap-1.5">
                          <span className="text-xs text-slate-400">İnecek durak:</span>
                          <select
                            value={i.stopId ?? ''}
                            onChange={(e) =>
                              assignMut.mutate({
                                stopId: e.target.value || 'yok',
                                itemIds: [i.id],
                              })
                            }
                            className={clsx(
                              'rounded-lg border bg-white px-2 py-1 text-xs',
                              isMismatched(i)
                                ? 'border-amber-500 bg-amber-50 font-medium text-amber-800'
                                : i.stopId
                                  ? 'border-slate-300 text-slate-700'
                                  : 'border-amber-300 text-amber-700',
                            )}
                            title={
                              isMismatched(i)
                                ? `Uyumsuz: bu yük ${i.recipientName} alıcısına gidiyor`
                                : undefined
                            }
                          >
                            <option value="">Seçilmedi</option>
                            {dispatch.stops.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.seq}. {stopLabel(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {editable && (
                        <button
                          onClick={() => removeItemMut.mutate(i.id)}
                          className="shrink-0 text-xs font-medium text-red-600"
                        >
                          Çıkar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {editable && (
        <Button
          className="w-full"
          loading={completeMut.isPending}
          disabled={dispatch.items.length === 0}
          onClick={async () => {
            if (
              await confirmDialog({
                message: `${loadSummary(dispatch.items)} sevk edilsin mi?`,
                confirmText: 'Sevk Et',
              })
            )
              completeMut.mutate();
          }}
        >
          🚚 Sevk Et ({loadSummary(dispatch.items)})
        </Button>
      )}

      {scanning && (
        <BarcodeScanner
          onScan={(code) => {
            setScanning(false);
            addMut.mutate({ packageCode: code, wholeReceipt: scanMode === 'lot' });
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

/** Sevk edilmiş sevkiyatta yanlış aracı/plakayı düzeltmek için araç seçme modalı. */
/** Yük satırlarını kabule göre gruplar (belge ve liste görünümü için). */
function groupByReceipt(items: DispatchItem[]) {
  const map = new Map<
    string,
    {
      receiptId: string;
      receiptReference: string;
      customerName?: string | null;
      recipientName?: string | null;
      waybillNo?: string | null;
      items: DispatchItem[];
    }
  >();
  for (const i of items) {
    const g = map.get(i.receiptId) ?? {
      receiptId: i.receiptId,
      receiptReference: i.receiptReference,
      customerName: i.customerName,
      recipientName: i.recipientName,
      waybillNo: i.waybillNo,
      items: [],
    };
    g.items.push(i);
    map.set(i.receiptId, g);
  }
  return [...map.values()];
}

/** "3 palet · 40 adet" gibi özet. */
function loadSummary(items: DispatchItem[]) {
  const pkg = items.filter((i) => i.kind === 'PACKAGE').length;
  const qty = items.filter((i) => i.kind === 'LINE').reduce((s, i) => s + i.qty, 0);
  const parts = [pkg ? `${pkg} kap` : '', qty ? `${qty} adet` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Henüz yük yok';
}

/**
 * Durağın tek satırlık etiketi: **YER — FİRMA**.
 * Yer önce, çünkü ekrandaki soru "nereye inecek". Firma da yazılır, çünkü aynı firmanın
 * birden çok lokasyonu olabilir (ör. Arkem'in "Gökbil Depo" ve "Yusufoğlu Depo"su) —
 * yalnız firma yazsak iki durak ayırt edilemezdi. Belgede (irsaliye) ALICI olarak
 * yasal gereklilikten FİRMA basılır; ekranda ikisi birlikte gösterilir.
 */
function stopLabel(s: { name: string; customerName?: string | null }): string {
  const co = s.customerName?.trim();
  if (!co || co === s.name) return s.name;
  return `${s.name} — ${co}`;
}

/**
 * Yük listesini DURAK SIRASINA göre dizer (liste · rota · irsaliye aynı sırayı göstersin).
 * Durak yoksa yükleme sırası korunur; durağa atanmamışlar en sona gider.
 * Bu kart bir rota editörü DEĞİL — sıra Duraklar kartından yönetilir.
 */
function sortByStop(groups: ReturnType<typeof groupByReceipt>, stops: DispatchStop[]) {
  const seq = new Map(stops.map((s) => [s.id, s.seq]));
  const LAST = Number.MAX_SAFE_INTEGER;
  const seqOf = (stopId?: string | null) => (stopId ? (seq.get(stopId) ?? LAST) : LAST);
  for (const g of groups) g.items.sort((a, b) => seqOf(a.stopId) - seqOf(b.stopId));
  return [...groups].sort(
    (a, b) =>
      Math.min(...a.items.map((i) => seqOf(i.stopId))) -
      Math.min(...b.items.map((i) => seqOf(i.stopId))),
  );
}

/** Bir durakta inen yükün özeti — "0 palet" yerine gerçekte ne varsa onu yazar. */
function stopLoadText(items: DispatchItem[], stopId: string) {
  const mine = items.filter((i) => i.stopId === stopId);
  if (mine.length === 0) return 'Yük atanmadı';
  const senders = new Set(mine.map((i) => i.customerName).filter(Boolean));
  return `${loadSummary(mine)} · ${senders.size} gönderici`;
}

/**
 * Depodan yük ekleme: kabul başına TEK mod.
 *  - Paleti olan kabul → palet (kap) seçilir
 *  - Paleti olmayan kabul → ürün + miktar seçilir (kısmi sevk)
 */
function LoadFromStockModal({
  stops,
  targetVehicleId,
  saving,
  onClose,
  onLoad,
}: {
  stops: DispatchStop[];
  targetVehicleId: string | null;
  saving: boolean;
  onClose: () => void;
  onLoad: (entries: LoadEntryInput[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [stopId, setStopId] = useState('');
  const [pkgSel, setPkgSel] = useState<Record<string, boolean>>({});
  const [lineQty, setLineQty] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['stock', { forLoad: true, search }],
    queryFn: () =>
      api.get<Paginated<Receipt>>(
        `/receipts/stock?page=1&pageSize=100&search=${encodeURIComponent(search)}`,
      ),
  });

  // Bu sevkiyatın aracına planlı kabuller öne gelsin
  const receipts = [...(data?.items ?? [])].sort(
    (a, b) =>
      Number(!!targetVehicleId && b.plannedVehicle?.id === targetVehicleId) -
      Number(!!targetVehicleId && a.plannedVehicle?.id === targetVehicleId),
  );

  const entries: LoadEntryInput[] = [
    ...Object.entries(pkgSel)
      .filter(([, v]) => v)
      .map(([packageId]) => ({ packageId, stopId: stopId || undefined })),
    ...Object.entries(lineQty)
      .filter(([, q]) => q > 0)
      .map(([receiptLineId, qty]) => ({ receiptLineId, qty, stopId: stopId || undefined })),
  ];
  const selPkg = entries.filter((e) => e.packageId).length;
  const selQty = entries.reduce((s, e) => s + (e.qty ?? 0), 0);

  return (
    <Modal title="Depodan Yük Ekle" onClose={onClose} wide>
      <div className="space-y-3">
        <Input
          placeholder="Ara: müşteri, referans, irsaliye no..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {stops.length > 0 && (
          <Field label="Durak (opsiyonel — yüklerken doğrudan ata)">
            <Combobox
              options={stops.map((s) => ({ value: s.id, label: `${s.seq}. ${stopLabel(s)}` }))}
              value={stopId}
              onChange={setStopId}
              nullable
              nullableLabel="Durak atama"
              placeholder="Durak seç..."
            />
          </Field>
        )}

        {isLoading ? (
          <Spinner />
        ) : receipts.length === 0 ? (
          <EmptyState title="Depoda yük yok" hint="Sevk bekleyen mal kabul bulunamadı." />
        ) : (
          <div className="max-h-[45vh] space-y-3 overflow-y-auto">
            {receipts.map((r) => {
              const pallets = (r.packages ?? []).filter((p) => !p.dispatchedAt && !p.dispatchId);
              const openLines = (r.lines ?? []).filter((l) => (l.remainingQty ?? 0) > 0);
              const palletMode = (r.packages ?? []).length > 0;
              return (
                <div key={r.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{r.customer?.name}</p>
                    <PlannedTag planned={r.plannedVehicle} targetId={targetVehicleId} />
                  </div>
                  <p className="mb-1.5 text-xs text-slate-500">
                    {r.reference}
                    {r.waybillNo ? ` · İrs: ${r.waybillNo}` : ''} ·{' '}
                    {palletMode ? 'kap bazlı' : 'ürün bazlı'}
                  </p>

                  {palletMode ? (
                    <div className="flex flex-wrap gap-1.5">
                      {pallets.map((p) => (
                        <label
                          key={p.id}
                          className={clsx(
                            'flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs',
                            pkgSel[p.id] ? 'border-brand bg-brand/5' : 'border-slate-200',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={!!pkgSel[p.id]}
                            onChange={(e) =>
                              setPkgSel((s) => ({ ...s, [p.id]: e.target.checked }))
                            }
                          />
                          {p.code}
                        </label>
                      ))}
                      {pallets.length > 1 && (
                        <button
                          onClick={() =>
                            setPkgSel((s) => {
                              const all = pallets.every((p) => s[p.id]);
                              const next = { ...s };
                              pallets.forEach((p) => (next[p.id] = !all));
                              return next;
                            })
                          }
                          className="text-xs font-medium text-brand"
                        >
                          Tümünü seç
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {openLines.map((l) => {
                        const max = l.remainingQty ?? 0;
                        const v = lineQty[l.id] ?? 0;
                        const set = (n: number) =>
                          setLineQty((s) => ({ ...s, [l.id]: Math.max(0, Math.min(max, n)) }));
                        return (
                          <div key={l.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                              {l.description}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                onClick={() => set(v - 1)}
                                className="h-6 w-6 rounded border border-slate-300 text-slate-600"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                value={v}
                                min={0}
                                max={max}
                                onChange={(e) => set(Number(e.target.value))}
                                className="w-14 rounded border border-slate-300 px-1 py-0.5 text-center text-xs"
                              />
                              <button
                                onClick={() => set(v + 1)}
                                className="h-6 w-6 rounded border border-slate-300 text-slate-600"
                              >
                                +
                              </button>
                              <button
                                onClick={() => set(max)}
                                className="ml-1 whitespace-nowrap text-[11px] font-medium text-brand"
                              >
                                /{max} {l.unit}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="text-xs text-slate-500">
            Seçili: {selPkg ? `${selPkg} kap` : ''}
            {selPkg && selQty ? ' · ' : ''}
            {selQty ? `${selQty} adet` : ''}
            {!selPkg && !selQty ? 'yok' : ''}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              type="button"
              disabled={entries.length === 0}
              loading={saving}
              onClick={() => onLoad(entries)}
            >
              Yükle
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Durak ekle/düzenle. Kayıtlı müşteri + lokasyon seçilebilir ya da serbest metin girilir. */
function StopModal({
  dispatchId,
  stop,
  onClose,
  onSaved,
}: {
  dispatchId: string;
  stop?: DispatchStop;
  onClose: () => void;
  onSaved: (d: Dispatch) => void;
}) {
  const [customerId, setCustomerId] = useState(stop?.customerId ?? '');
  const [locationId, setLocationId] = useState(stop?.customerLocationId ?? '');
  const [name, setName] = useState(stop?.name ?? '');
  const [address, setAddress] = useState(stop?.address ?? '');
  const [phone, setPhone] = useState(stop?.phone ?? '');
  const { data: customers } = useCustomers();
  const { data: locations } = useCustomerLocations(customerId || undefined);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        customerId: customerId || undefined,
        customerLocationId: locationId || undefined,
        name: name.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      return stop
        ? api.patch<Dispatch>(`/dispatches/${dispatchId}/stops/${stop.id}`, body)
        : api.post<Dispatch>(`/dispatches/${dispatchId}/stops`, body);
    },
    onSuccess: onSaved,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Durak kaydedilemedi'),
  });

  return (
    <Modal title={stop ? 'Durağı Düzenle' : 'Yeni Durak'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Alıcı (Müşteri)">
          <Combobox
            options={(customers ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setLocationId('');
            }}
            nullable
            nullableLabel="Kayıtlı müşteri yok (serbest)"
            placeholder="Müşteri ara / seç..."
          />
        </Field>
        {customerId && (
          <Field label="Boşaltma Yeri">
            <Combobox
              options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))}
              value={locationId}
              onChange={setLocationId}
              nullable
              nullableLabel="Lokasyon seçilmedi"
              placeholder="Lokasyon ara / seç..."
            />
          </Field>
        )}
        {!locationId && (
          <>
            <Field label="Durak Adı *">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Polymix Gebze Deposu"
              />
            </Field>
            <Field label="Adres">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Telefon">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </>
        )}
        {locationId && (
          <p className="text-xs text-slate-500">
            Ad, adres ve telefon seçilen lokasyondan alınır (belgeye o an ki hâliyle yazılır).
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!locationId && !name.trim()}
            loading={mut.isPending}
            onClick={() => mut.mutate()}
          >
            Kaydet
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Matbu taşıma irsaliyesinin seri/sıra no'su + taşıma ücreti. */
function WaybillInfoModal({
  dispatch,
  onClose,
  onSaved,
}: {
  dispatch: Dispatch;
  onClose: () => void;
  onSaved: (d: Dispatch) => void;
}) {
  const [destination, setDestination] = useState(dispatch.destination ?? '');
  const [serial, setSerial] = useState(dispatch.waybillSerial ?? '');
  const [no, setNo] = useState(dispatch.waybillNo ?? '');
  const [date, setDate] = useState(dispatch.waybillDate?.slice(0, 10) ?? '');
  const [amount, setAmount] = useState(
    dispatch.freightAmount != null ? String(dispatch.freightAmount) : '',
  );
  const [vatIncluded, setVatIncluded] = useState(!!dispatch.freightVatIncluded);

  const mut = useMutation({
    mutationFn: () =>
      api.patch<Dispatch>(`/dispatches/${dispatch.id}/waybill`, {
        destination,
        waybillSerial: serial,
        waybillNo: no,
        waybillDate: date || undefined,
        freightAmount: amount,
        freightVatIncluded: vatIncluded,
      }),
    onSuccess: (d) => {
      toast('İrsaliye bilgileri kaydedildi.');
      onSaved(d);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  return (
    <Modal
      title="Taşıma İrsaliyesi Bilgileri"
      description="Elinizdeki matbu formun üzerindeki numarayı girin"
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Gideceği Yer (belgeye basılır)">
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Örn. Avrupa Yakası, Kocaeli"
          />
        </Field>
        <p className="-mt-2 text-xs text-slate-400">
          Kısa bir bölge/rota adı olmalı — alıcılar zaten belgenin satırlarında yazıyor.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Seri">
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="A" />
          </Field>
          <div className="col-span-2">
            <Field label="Sıra No">
              <Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="012345" />
            </Field>
          </div>
        </div>
        <Field label="Düzenleme Tarihi">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Taşıma Ücreti (₺)">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={vatIncluded}
            onChange={(e) => setVatIncluded(e.target.checked)}
          />
          Girilen ücret KDV dahil
        </label>
        <p className="text-xs text-slate-400">
          Seri/sıra numarasını anlaşmalı matbaa basar; buradaki değer yalnızca kâğıt belgeyle dijital
          kaydı eşleştirir.
        </p>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" className="flex-1" loading={mut.isPending} onClick={() => mut.mutate()}>
            Kaydet
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChangeVehicleModal({
  currentVehicleId,
  onClose,
  onSave,
  saving,
}: {
  currentVehicleId: string | null;
  onClose: () => void;
  onSave: (vehicleId: string) => void;
  saving: boolean;
}) {
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState(currentVehicleId ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md space-y-3 rounded-b-none sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="font-semibold text-slate-900">Aracı Değiştir</h3>
          <p className="text-sm text-slate-500">Yanlış plakayla sevk edildiyse doğru aracı seçin.</p>
        </div>

        <Field label="Araç / Plaka">
          <Combobox
            options={(vehicles ?? []).map((v) => ({
              value: v.id,
              label: `${v.plate}${v.driverName ? ` - ${v.driverName}` : ''}`,
            }))}
            value={vehicleId}
            onChange={setVehicleId}
            placeholder="Araç ara / seç..."
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!vehicleId || vehicleId === currentVehicleId}
            loading={saving}
            onClick={() => onSave(vehicleId)}
          >
            Kaydet
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Paletin ön ihbarda planlanan aracını gösterir; sevkiyatın aracıyla eşleşmeyi vurgular. */
function PlannedTag({
  planned,
  targetId,
}: {
  planned?: VehicleSummary | null;
  targetId: string | null;
}) {
  const base = 'rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap';
  if (!planned) return <span className={clsx(base, 'bg-slate-100 text-slate-500')}>araç belirsiz</span>;
  if (targetId && planned.id === targetId)
    return <span className={clsx(base, 'bg-green-100 text-green-700')}>✓ {planned.plate}</span>;
  if (targetId)
    return <span className={clsx(base, 'bg-amber-100 text-amber-700')}>⚠ {planned.plate}</span>;
  return <span className={clsx(base, 'bg-indigo-100 text-indigo-700')}>🚚 {planned.plate}</span>;
}
