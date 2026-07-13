import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import { useReactToPrint } from 'react-to-print';
import {
  upsertReceiptLineSchema,
  PACKAGE_TYPE_LABELS,
  PACKAGE_TYPES,
  DISCREPANCY_TYPE_LABELS,
  VAT_RATE,
  type Receipt,
  type ReceiptLine,
  type UpsertReceiptLineInput,
  type Package,
  type DiscrepancyType,
  type WaybillExtraction,
} from '@lojistik/shared';
import { api, ApiError, assetUrl, uploadSingle } from '../lib/api';
import { isNativeApp } from '../lib/config';
import { formatDate, formatMoney } from '../lib/format';
import { COMPANY } from '../lib/company';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import { Button, Card, Combobox, Field, Input, Spinner, Badge } from '../components/ui';
import { ReceiptStatusBadge } from '../components/ReceiptStatusBadge';
import { DiscrepancyModal } from '../components/DiscrepancyModal';
import { WaybillCamera } from '../components/WaybillCamera';

export function ReceiptCountPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [prefill, setPrefill] = useState<{
    sku?: string;
    barcode?: string;
    description?: string;
    qty?: number;
  }>({});
  const [qrPackage, setQrPackage] = useState<Package | null>(null);
  const [pkgType, setPkgType] = useState('PALLET');
  const [pkgCount, setPkgCount] = useState('1');
  const [labelsPrintOpen, setLabelsPrintOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [discrepancyFor, setDiscrepancyFor] = useState<{
    lineId?: string;
    type?: DiscrepancyType;
  } | null>(null);

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipts', id],
    queryFn: () => api.get<Receipt>(`/receipts/${id}`),
    enabled: !!id,
  });

  const setReceipt = (r: Receipt) => qc.setQueryData(['receipts', id], r);

  const upsertMut = useMutation({
    mutationFn: (input: UpsertReceiptLineInput) => api.patch<Receipt>(`/receipts/${id}/lines`, input),
    onSuccess: (r) => setReceipt(r),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  const completeMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/complete`),
    onSuccess: (r) => {
      setReceipt(r);
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['asn'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Tamamlanamadı'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['asn'] });
      toast('Mal kabul iptal edildi; ön ihbar tekrar düzenlenebilir.');
      navigate('/mal-kabul', { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'İptal edilemedi'),
  });

  const reopenMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/reopen`),
    onSuccess: (r) => {
      setReceipt(r);
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['asn'] });
      toast('Mal kabul geri açıldı; düzenleyebilirsiniz.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Geri açılamadı'),
  });

  const packageMut = useMutation({
    mutationFn: (body: { type: string; count: number }) =>
      api.post<Package[]>(`/receipts/${id}/packages`, body),
    onSuccess: (pkgs) => {
      qc.invalidateQueries({ queryKey: ['receipts', id] });
      toast(`🏷️ ${pkgs.length} etiket üretildi`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Etiket üretilemedi'),
  });

  const deleteDiscrepancyMut = useMutation({
    mutationFn: (discrepancyId: string) => api.delete(`/discrepancies/${discrepancyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['receipts', id] }),
  });

  if (isLoading) return <Spinner />;
  if (!receipt) return <p className="text-slate-500">Kayıt bulunamadı.</p>;

  const editable = receipt.status === 'IN_PROGRESS';
  const dispatched =
    receipt.dispatchId != null ||
    (receipt.packages ?? []).some((p) => p.dispatchId || p.dispatchedAt);
  const canReopen = receipt.status === 'COMPLETED' && !dispatched;

  const setCount = (line: ReceiptLine, qty: number) => {
    upsertMut.mutate({
      lineId: line.id,
      sku: line.sku,
      description: line.description,
      countedQty: Math.max(0, qty),
      unit: line.unit,
      barcode: line.barcode ?? undefined,
    });
  };

  const totalCounted = receipt.lines.reduce((s, l) => s + l.countedQty, 0);
  const totalExpected = receipt.lines.reduce((s, l) => s + (l.expectedQty ?? 0), 0);
  const hasDiscrepancy = receipt.lines.some(
    (l) => l.expectedQty != null && l.countedQty !== l.expectedQty,
  );

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/mal-kabul')} className="text-slate-500">
        ← Mal Kabul
      </button>

      <Card className="space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{receipt.reference}</h2>
            <p className="text-xs text-slate-500">
              {receipt.customer?.name}
              {receipt.asnReference ? ` · Öİ: ${receipt.asnReference}` : ' · Kör kabul'}
            </p>
          </div>
          <ReceiptStatusBadge status={receipt.status} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Toplam sayılan</span>
          <span className="font-semibold">
            {totalCounted}
            {totalExpected ? ` / ${totalExpected}` : ''} adet
          </span>
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setSlipOpen(true)}>
          🖨️ Tesellüm Fişi
        </Button>
      </Card>

      <DocumentEditor
        receiptId={receipt.id}
        initialWaybill={receipt.waybillNo ?? ''}
        initialOrder={receipt.orderNo ?? ''}
        editable={editable}
      />

      {editable && (
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => {
            setPrefill({});
            setAddOpen(true);
          }}
        >
          + Kalem Ekle
        </Button>
      )}


      {/* Kalemler */}
      <div className="space-y-2">
        {receipt.lines.length === 0 ? (
          <Card className="text-center text-sm text-slate-500">
            Henüz kalem yok. "+ Kalem Ekle" ile satır girin.
          </Card>
        ) : (
          receipt.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              editable={editable}
              onSetCount={setCount}
              onReport={(type) => setDiscrepancyFor({ lineId: line.id, type })}
            />
          ))
        )}
      </div>

      {/* QR etiketleri */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">QR Etiketler ({receipt.packages?.length ?? 0})</h3>
          {receipt.packages && receipt.packages.length > 0 && (
            <Button variant="secondary" onClick={() => setLabelsPrintOpen(true)}>
              🖨️ Tümünü Yazdır
            </Button>
          )}
        </div>

        {editable && (
          <div className="flex items-end gap-2 rounded-lg bg-slate-50 p-2">
            <Field label="Tür">
              <Combobox
                options={PACKAGE_TYPES.map((t) => ({ value: t, label: PACKAGE_TYPE_LABELS[t] }))}
                value={pkgType}
                onChange={setPkgType}
              />
            </Field>
            <Field label="Adet">
              <Input
                type="number"
                min={1}
                max={500}
                value={pkgCount}
                onChange={(e) => setPkgCount(e.target.value)}
                className="w-20"
              />
            </Field>
            <Button
              loading={packageMut.isPending}
              onClick={() => {
                const count = Math.max(1, Math.min(500, Number(pkgCount) || 1));
                packageMut.mutate({ type: pkgType, count });
              }}
            >
              Üret
            </Button>
          </div>
        )}
        {receipt.packages && receipt.packages.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {receipt.packages.map((p) => (
              <button
                key={p.id}
                onClick={() => setQrPackage(p)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left"
              >
                <QRCodeSVG value={p.code} size={44} />
                <div>
                  <p className="text-xs font-semibold text-slate-800">{p.code}</p>
                  <p className="text-xs text-slate-400">{PACKAGE_TYPE_LABELS[p.type]}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Her koli/palet için QR etiket üretebilirsiniz.</p>
        )}
      </Card>

      {/* Tutanaklar / Hasar */}
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            Tutanaklar ({receipt.discrepancies?.length ?? 0})
          </h3>
          {editable && (
            <Button variant="secondary" onClick={() => setDiscrepancyFor({})}>
              + Tutanak
            </Button>
          )}
        </div>
        {receipt.discrepancies && receipt.discrepancies.length > 0 ? (
          <div className="space-y-2">
            {receipt.discrepancies.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-2">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge className="bg-red-100 text-red-700">
                      {DISCREPANCY_TYPE_LABELS[d.type]}
                      {d.qty != null ? ` · ${d.qty}` : ''}
                    </Badge>
                    <p className="mt-1 text-sm text-slate-700">{d.description}</p>
                  </div>
                  {editable && (
                    <button
                      onClick={async () => {
                        if (
                          await confirmDialog({
                            message: 'Tutanak silinsin mi?',
                            confirmText: 'Sil',
                            danger: true,
                          })
                        )
                          deleteDiscrepancyMut.mutate(d.id);
                      }}
                      className="text-xs font-medium text-red-600"
                    >
                      Sil
                    </button>
                  )}
                </div>
                {d.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.attachments.map((a) => (
                      <a key={a.id} href={assetUrl(a.url)} target="_blank" rel="noreferrer">
                        <img
                          src={assetUrl(a.url)}
                          alt={a.fileName}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Eksik, fazla veya hasar varsa fotoğraflı tutanak ekleyin.
          </p>
        )}
      </Card>

      {editable && (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            variant={hasDiscrepancy ? 'secondary' : 'primary'}
            loading={completeMut.isPending}
            onClick={async () => {
              const msg = hasDiscrepancy
                ? 'Beklenen ile sayılan arasında fark var. Yine de tamamlansın mı?'
                : 'Mal kabul tamamlansın mı?';
              if (await confirmDialog({ message: msg, confirmText: 'Tamamla', danger: hasDiscrepancy }))
                completeMut.mutate();
            }}
          >
            {hasDiscrepancy ? '⚠ Farklı Tamamla' : '✓ Tamamla'}
          </Button>
          <Button
            className="w-full"
            variant="danger"
            loading={cancelMut.isPending}
            onClick={async () => {
              if (
                await confirmDialog({
                  title: 'Mal kabulü iptal et',
                  message:
                    'Bu mal kabul iptal edilsin mi? Ön ihbar tekrar "beklenen" durumuna döner ve düzenlenebilir. (Üretilen palet/tutanaklar bu kabulde kalır.)',
                  confirmText: 'İptal Et',
                  danger: true,
                })
              )
                cancelMut.mutate();
            }}
          >
            Mal Kabulü İptal Et
          </Button>
        </div>
      )}

      {canReopen && (
        <Button
          className="w-full"
          variant="secondary"
          loading={reopenMut.isPending}
          onClick={async () => {
            if (
              await confirmDialog({
                title: 'Mal kabulü geri aç',
                message:
                  'Bu tamamlanmış mal kabul tekrar düzenlenebilir duruma gelsin mi? (Sayım, belge ve palet ekleme yeniden açılır. Depodan geçici olarak kaldırılır.)',
                confirmText: 'Geri Aç',
              })
            )
              reopenMut.mutate();
          }}
        >
          ↩ Geri Aç (Düzenle)
        </Button>
      )}

      {addOpen && (
        <AddLineModal
          prefill={prefill}
          onClose={() => setAddOpen(false)}
          onSubmit={(input) => {
            upsertMut.mutate(input);
            setAddOpen(false);
          }}
        />
      )}
      {qrPackage && <QrLabelModal pkg={qrPackage} customer={receipt.customer?.name} onClose={() => setQrPackage(null)} />}
      {labelsPrintOpen && receipt.packages && (
        <LabelsPrintModal
          packages={receipt.packages}
          customer={receipt.customer?.name}
          onClose={() => setLabelsPrintOpen(false)}
        />
      )}
      {slipOpen && <ReceiptSlipModal receipt={receipt} onClose={() => setSlipOpen(false)} />}
      {discrepancyFor && (
        <DiscrepancyModal
          receiptId={receipt.id}
          lines={receipt.lines}
          defaultLineId={discrepancyFor.lineId}
          defaultType={discrepancyFor.type}
          onClose={() => setDiscrepancyFor(null)}
        />
      )}
    </div>
  );
}

function DocumentEditor({
  receiptId,
  initialWaybill,
  initialOrder,
  editable,
}: {
  receiptId: string;
  initialWaybill: string;
  initialOrder: string;
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [waybill, setWaybill] = useState(initialWaybill);
  const [order, setOrder] = useState(initialOrder);
  const mut = useMutation({
    mutationFn: () =>
      api.patch<Receipt>(`/receipts/${receiptId}`, { waybillNo: waybill, orderNo: order }),
    onSuccess: (r) => {
      qc.setQueryData(['receipts', receiptId], r);
      toast('Belge bilgileri kaydedildi');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const ocrMut = useMutation({
    mutationFn: (file: File) => uploadSingle<WaybillExtraction>('/ocr/waybill', file),
    onSuccess: (res) => fillFromOcr(res),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Okunamadı'),
  });

  function fillFromOcr(res: WaybillExtraction) {
    if (res.waybillNo) setWaybill(res.waybillNo);
    if (res.orderNo) setOrder(res.orderNo);
    toast(
      res.waybillNo || res.orderNo
        ? "📄 Okundu — kontrol edip Kaydet'e basın"
        : 'Numara okunamadı — İrsaliye No net görünecek şekilde tekrar çekin.',
    );
  }

  // Native app'te CameraX'li arka kamera; tarayıcıda telefonun kamera diyaloğu (yedek).
  const openCamera = () => {
    if (isNativeApp()) setCameraOpen(true);
    else fileRef.current?.click();
  };

  // Tamamlanmış ve her iki alan da boşsa hiç gösterme
  if (!editable && !initialWaybill && !initialOrder) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">Belge Bilgileri</span>
        {editable && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) ocrMut.mutate(f);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={ocrMut.isPending}
              onClick={openCamera}
            >
              📷 İrsaliye No Oku
            </Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="İrsaliye No">
          <Input
            value={waybill}
            onChange={(e) => setWaybill(e.target.value)}
            placeholder="örn. GZB-2026-0456"
            disabled={!editable}
          />
        </Field>
        <Field label="Sipariş No">
          <Input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="örn. SIP-2026-1234"
            disabled={!editable}
          />
        </Field>
      </div>
      {editable && (
        <Button variant="secondary" loading={mut.isPending} onClick={() => mut.mutate()}>
          Kaydet
        </Button>
      )}
      {cameraOpen && (
        <WaybillCamera onResult={fillFromOcr} onClose={() => setCameraOpen(false)} />
      )}
    </Card>
  );
}

function LineRow({
  line,
  editable,
  onSetCount,
  onReport,
}: {
  line: ReceiptLine;
  editable: boolean;
  onSetCount: (line: ReceiptLine, qty: number) => void;
  onReport: (type: DiscrepancyType) => void;
}) {
  const expected = line.expectedQty;
  const state =
    expected == null
      ? 'extra'
      : line.countedQty === expected
        ? 'ok'
        : line.countedQty < expected
          ? 'short'
          : 'over';
  const color = {
    ok: 'border-green-300 bg-green-50',
    short: 'border-amber-300 bg-amber-50',
    over: 'border-red-300 bg-red-50',
    extra: 'border-slate-200 bg-white',
  }[state];

  return (
    <div className={clsx('rounded-lg border p-3', color)}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{line.description}</p>
          <p className="text-xs text-slate-500">
            {line.sku}
            {line.barcode ? ` · ${line.barcode}` : ''}
            {expected == null && ' · ekstra (ön ihbarda yok)'}
          </p>
        </div>
        <div className="text-right text-sm">
          <span className="font-bold text-slate-900">{line.countedQty}</span>
          {expected != null && <span className="text-slate-400"> / {expected}</span>}
          <span className="ml-1 text-xs text-slate-400">{line.unit}</span>
        </div>
      </div>
      {editable && (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => onSetCount(line, line.countedQty - 1)}
            className="h-8 w-8 rounded-lg bg-white text-lg font-bold text-slate-700 shadow-sm"
          >
            −
          </button>
          <input
            type="number"
            value={line.countedQty}
            onChange={(e) => onSetCount(line, Number(e.target.value) || 0)}
            className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm"
          />
          <button
            onClick={() => onSetCount(line, line.countedQty + 1)}
            className="h-8 w-8 rounded-lg bg-brand text-lg font-bold text-white"
          >
            +
          </button>
          {(state === 'short' || state === 'over') && (
            <button
              onClick={() => onReport(state === 'short' ? 'SHORTAGE' : 'OVERAGE')}
              className="ml-auto text-xs font-medium text-red-600"
            >
              ⚠ Tutanak
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddLineModal({
  prefill,
  onClose,
  onSubmit,
}: {
  prefill: { sku?: string; barcode?: string; description?: string; qty?: number };
  onClose: () => void;
  onSubmit: (input: UpsertReceiptLineInput) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpsertReceiptLineInput>({
    resolver: zodResolver(upsertReceiptLineSchema),
    defaultValues: {
      sku: prefill.sku ?? '',
      barcode: prefill.barcode ?? '',
      description: prefill.description ?? '',
      countedQty: prefill.qty ?? 1,
      unit: 'ADET',
    },
  });
  const scannedCode = prefill.barcode ?? prefill.sku;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <Card className="w-full max-w-md space-y-3 rounded-b-none sm:rounded-xl">
        <h3 className="font-semibold text-slate-900">Kalem Ekle</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {scannedCode && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Okutulan kod: <span className="font-medium text-slate-700">{scannedCode}</span>
            </p>
          )}
          {/* Okutulan kod arka planda barkod/sku olarak saklanır (sonraki okutmalar eşleşsin) */}
          <input type="hidden" {...register('sku')} />
          <input type="hidden" {...register('barcode')} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Açıklama *" error={errors.description?.message}>
              <Input placeholder="Örn. Muhtelif palet" {...register('description')} />
            </Field>
            <Field label="Adet *" error={errors.countedQty?.message}>
              <Input type="number" min={0} {...register('countedQty')} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" className="flex-1">
              Ekle
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function LabelsPrintModal({
  packages,
  customer,
  onClose,
}: {
  packages: Package[];
  customer?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <span className="font-semibold text-slate-900">{packages.length} Etiket</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Button onClick={() => window.print()}>🖨️ Yazdır</Button>
        </div>
      </div>
      <div className="print-sheet grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-4 sm:grid-cols-3">
        {packages.map((p) => (
          <div
            key={p.id}
            className="label flex flex-col items-center rounded-lg border border-slate-300 p-3"
          >
            <QRCodeSVG value={p.code} size={130} />
            <p className="mt-2 text-sm font-bold tracking-wide text-slate-900">{p.code}</p>
            <p className="text-xs text-slate-500">
              {PACKAGE_TYPE_LABELS[p.type]}
              {customer ? ` · ${customer}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

type SlipMode = 'full' | 'data' | 'blank';
const SLIP_MODES: { key: SlipMode; label: string }[] = [
  { key: 'full', label: 'Boş kağıda tam' },
  { key: 'data', label: 'Matbu forma (yalnız veri)' },
  { key: 'blank', label: 'Boş form (matbaa master)' },
];

type SlipLayout = 'a5' | 'a4x2';
const SLIP_LAYOUTS: { key: SlipLayout; label: string }[] = [
  { key: 'a5', label: 'A5 tek' },
  { key: 'a4x2', label: "A4'e 2 fiş (kes)" },
];

/** Fişin görsel gövdesi — tek bir A5 form. A5-tek ve A4-2'li yerleşimde aynen kullanılır. */
function SlipForm({ receipt }: { receipt: Receipt }) {
  const totalCounted = receipt.lines.reduce((s, l) => s + l.countedQty, 0);
  const packages = receipt.packages ?? [];
  const discrepancies = receipt.discrepancies ?? [];

  // Palet/koli tip özeti (ör. 5 Palet, 2 Koli)
  const typeCounts = packages.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] ?? 0) + 1;
    return acc;
  }, {});
  const typeSummary = Object.entries(typeCounts)
    .map(([t, n]) => `${n} ${PACKAGE_TYPE_LABELS[t as keyof typeof PACKAGE_TYPE_LABELS] ?? t}`)
    .join(' · ');

  // Formu doldurmak için tabloyu en az 5 satıra tamamla
  const minRows = 5;
  const blanks = Math.max(0, minRows - receipt.lines.length);
  const th = 'border border-sky-800 px-1 py-0.5 text-[8px] font-bold uppercase text-sky-800';
  const td = 'border border-sky-800 px-1 py-1 align-top';

  // QR = fişi uygulamada açan link (okutunca mal kabul kaydı gelir)
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slipUrl = origin ? `${origin}/mal-kabul/${receipt.id}` : receipt.reference;
  const logoUrl = origin ? `${origin}${COMPANY.logoPath}` : COMPANY.logoPath;

  // Ücret: alıcı ödemeli→görünür; gönderici ödemeli→yalnız "göster" işaretliyse görünür.
  const showAmount =
    receipt.paymentType === 'RECIPIENT' ||
    (receipt.paymentType === 'SENDER' && !!receipt.showAmountOnSlip);
  const lineAmount = (l: ReceiptLine) => (l.unitPrice != null ? l.countedQty * l.unitPrice : null);
  const hasPrice = receipt.lines.some((l) => l.unitPrice != null);
  const subtotal = receipt.lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0);
  const vatIncluded = !!receipt.vatIncluded;
  const net = vatIncluded ? subtotal / (1 + VAT_RATE) : subtotal;
  const vat = vatIncluded ? subtotal - net : subtotal * VAT_RATE;
  const grand = vatIncluded ? subtotal : subtotal + vat;

  return (
    <div className="slip-chrome flex min-h-[124mm] flex-1 flex-col border-2 border-sky-800">
      {/* Başlık: logo/firma + QR + fiş bilgileri */}
      <div className="flex border-b-2 border-sky-800">
        <div className="flex w-[42%] items-center gap-2 border-r-2 border-sky-800 p-2">
          <div className="flex flex-1 flex-col items-center justify-center gap-1 overflow-hidden">
            <img
              src={logoUrl}
              alt={COMPANY.name}
              className="h-[62px] w-auto max-w-[175px] object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="flex flex-wrap justify-center gap-1">
              {COMPANY.docs.map((d) => (
                <div
                  key={d.code}
                  className="flex flex-col overflow-hidden rounded border border-sky-800 text-center leading-none text-sky-800"
                >
                  <span className="border-b border-sky-800 px-1.5 py-0.5 text-[10px] font-black">
                    {d.code}
                  </span>
                  <span className="px-1.5 py-0.5 text-[6px]">
                    {d.no.split('.').slice(-2).join('.')}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="slip-data flex flex-col items-center">
            <QRCodeSVG value={slipUrl} size={48} />
            <span className="mt-0.5 text-[7px] font-semibold">{receipt.reference}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-2">
          <h1 className="text-right text-base font-black tracking-wide text-sky-800">
            AMBAR TESELLÜM FİŞİ
          </h1>
          <div className="mt-1 space-y-0.5">
            <MetaLine label="SERİ / SIRA NO" value={receipt.reference} />
            <MetaLine label="TARİH" value={formatDate(receipt.completedAt ?? receipt.startedAt)} />
            <MetaLine label="GÖNDERİCİ SEVK İRS. NO" value={receipt.waybillNo || ''} />
            <MetaLine label="SİPARİŞ NO" value={receipt.orderNo || ''} />
            <MetaLine label="ÖN İHBAR" value={receipt.asnReference || 'Kör kabul'} />
            {receipt.principalName && <MetaLine label="İŞİ VEREN" value={receipt.principalName} />}
          </div>
        </div>
      </div>

      {/* GÖNDEREN + mal tablosu */}
      <div className="flex border-b-2 border-sky-800">
        <div className="w-[42%] border-r-2 border-sky-800 p-2">
          <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Gönderen / Sender</p>
          <FieldLine
            label="ADI, ÜNVANI"
            value={`${receipt.customer?.name ?? ''}${
              receipt.customer?.code ? ` (${receipt.customer.code})` : ''
            }`}
          />
          <FieldLine label="V. DAİRESİ" value={receipt.customer?.taxOffice || ''} />
          <FieldLine label="V. NO" value={receipt.customer?.taxNumber || ''} />
          <FieldLine label="ADRESİ" value={receipt.customer?.address || ''} />
          <FieldLine label="TEL" value={receipt.customer?.phone || ''} />
        </div>
        <div className="flex-1">
          <table className="w-full border-collapse text-[9px]">
            <thead>
              <tr>
                <th className={`${th} w-[8%]`}>SIRA</th>
                <th className={th}>MALIN CİNSİ</th>
                <th className={`${th} w-[11%] text-right`}>ADET</th>
                <th className={`${th} w-[10%]`}>KAP</th>
                <th className={`${th} w-[12%]`}>KG.</th>
                <th className={`${th} w-[15%]`}>ÜCRET</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={`${td} text-center`}>
                    <span className="slip-data">{i + 1}</span>
                  </td>
                  <td className={td}>
                    <span className="slip-data">{l.description}</span>
                  </td>
                  <td className={`${td} text-right font-semibold`}>
                    <span className="slip-data">{l.countedQty}</span>
                  </td>
                  <td className={td} />
                  <td className={td} />
                  <td className={`${td} text-right`}>
                    {showAmount && lineAmount(l) != null ? (
                      <span className="slip-data">{formatMoney(lineAmount(l))}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blanks }).map((_, i) => (
                <tr key={`b${i}`}>
                  <td className={`${td} text-center text-slate-300`}>
                    <span className="slip-data">{receipt.lines.length + i + 1}</span>
                  </td>
                  <td className={td}>&nbsp;</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={td} />
                  <td className={td} />
                </tr>
              ))}
              <tr>
                <td className={`${td} text-right font-bold`} colSpan={2}>
                  TOPLAM
                </td>
                <td className={`${td} text-right font-bold`}>
                  <span className="slip-data">{totalCounted}</span>
                </td>
                <td className={td} colSpan={2}>
                  <span className="slip-data">
                    Palet/Koli: {packages.length}
                    {typeSummary ? ` · ${typeSummary}` : ''}
                  </span>
                </td>
                <td className={`${td} text-right font-bold`}>
                  {showAmount && hasPrice ? (
                    <span className="slip-data">{formatMoney(grand)}</span>
                  ) : null}
                </td>
              </tr>
              {showAmount && hasPrice && (
                <tr>
                  <td className={`${td} text-right`} colSpan={6}>
                    <span className="slip-data text-[8px]">
                      {vatIncluded
                        ? `Genel Toplam: ${formatMoney(grand)} (KDV dahil)`
                        : `Ara Toplam: ${formatMoney(net)} · KDV %20: ${formatMoney(vat)} · Genel Toplam: ${formatMoney(grand)}`}
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ALICI + ödeme + tesellüm beyanı */}
      <div className="flex flex-1">
        <div className="w-[42%] border-r-2 border-sky-800 p-2">
          <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Alıcı / Delivery</p>
          <FieldLine label="ADI, ÜNVANI" value={receipt.recipientCustomer?.name ?? ''} />
          <FieldLine label="V. DAİRESİ" value={receipt.recipientCustomer?.taxOffice || ''} />
          <FieldLine label="V. NO" value={receipt.recipientCustomer?.taxNumber || ''} />
          <FieldLine label="ADRESİ" value={receipt.recipientCustomer?.address || ''} />
          <FieldLine label="TEL" value={receipt.recipientCustomer?.phone || ''} />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="flex border-b-2 border-sky-800 text-[9px] font-semibold text-sky-800">
            <div className="flex flex-1 items-center justify-center gap-2 border-r-2 border-sky-800 p-2">
              GÖNDERİCİ ÖDEMELİ
              <span className="flex h-3 w-3 items-center justify-center border border-sky-800">
                <span className="slip-data text-[9px] font-black leading-none text-sky-800">
                  {receipt.paymentType === 'SENDER' ? 'X' : ''}
                </span>
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center gap-2 p-2">
              ALICI ÖDEMELİ
              <span className="flex h-3 w-3 items-center justify-center border border-sky-800">
                <span className="slip-data text-[9px] font-black leading-none text-sky-800">
                  {receipt.paymentType === 'RECIPIENT' ? 'X' : ''}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-between p-2">
            <p className="text-[9px] text-slate-700">
              İşbu ambar tesellüm fişindeki malları tam ve sağlam teslim aldım.
              {discrepancies.length > 0 && (
                <span className="slip-data font-semibold text-red-700">
                  {' '}
                  (Uyuşmazlık: {discrepancies.length} kayıt)
                </span>
              )}
            </p>
            {receipt.notes && (
              <p className="slip-data text-[8px] text-slate-500">Not: {receipt.notes}</p>
            )}
            <p className="text-right text-[9px] font-semibold text-slate-600">
              Lütfen kaşenizi basınız.
            </p>
          </div>
        </div>
      </div>

      {/* Firma iletişim şeridi (marka / reklam) — tam ünvan + iki şube */}
      <div className="border-t-2 border-sky-800 px-2 py-1 text-center text-[7px] text-sky-800">
        <p className="font-bold">
          {COMPANY.name}
          {COMPANY.website ? ` · ${COMPANY.website}` : ''}
        </p>
        <div className="mt-0.5 flex flex-wrap justify-center gap-x-3 gap-y-0">
          {COMPANY.branches.map((b) => (
            <span key={b.name}>
              <span className="font-bold">{b.name}:</span> {b.address} · Tel: {b.phone} · {b.email}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Ambar Tesellüm Fişi: A5 YATAY resmi form. 3 baskı modu (aynı yerleşim → hizalama otomatik):
 *  full=boş kağıda tam, data=matbu forma yalnız veri (dot-matrix), blank=matbaaya boş form master. */
function ReceiptSlipModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const [mode, setMode] = useState<SlipMode>('full');
  const [layout, setLayout] = useState<SlipLayout>('a5');
  const printRef = useRef<HTMLDivElement>(null);

  // Baskı izole bir iframe'de yapılır (react-to-print) → sayfalama düzgün, kırpılma yok.
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Tesellum_${receipt.reference}`,
    pageStyle: `
      @page { size: ${layout === 'a5' ? 'A5 landscape' : 'A4 portrait'}; margin: ${layout === 'a5' ? '5mm' : '4mm'}; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      body * { visibility: visible !important; }
      .slip-doc { width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
    `,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      {/* Araç çubuğu — yazdırmada gizli */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-4">
        <span className="font-semibold text-slate-900">Tesellüm Fişi</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {SLIP_LAYOUTS.map((l) => (
              <button
                key={l.key}
                onClick={() => setLayout(l.key)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  layout === l.key ? 'bg-white text-brand shadow-sm' : 'text-slate-500',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {SLIP_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={clsx(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition',
                  mode === m.key ? 'bg-white text-brand shadow-sm' : 'text-slate-500',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Button onClick={() => handlePrint()}>🖨️ Yazdır</Button>
        </div>
      </div>

      {mode !== 'full' && (
        <div className="bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          {mode === 'data'
            ? 'Yalnız veriler basılır — matbu (önceden basılı) forma yerleştirmek için. Çizgi/etiketler basılmaz.'
            : 'Yalnız boş form basılır — matbaaya bu master ile bastırın. Veriler görünmez.'}
        </div>
      )}
      {layout === 'a4x2' && (
        <div className="bg-sky-50 px-4 py-1.5 text-xs text-sky-800">
          A4 sayfaya alt alta 2 fiş basılır; ortadaki kesik çizgiden keserek 2 adet A5 fiş elde edersin.
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div
          ref={printRef}
          className={clsx(
            'slip-doc mx-auto w-[210mm] bg-white text-slate-900 shadow-lg',
            layout === 'a5' && 'p-[6mm]',
            layout === 'a4x2' && 'slip-a4',
            mode === 'data' && 'slip-hide-chrome',
            mode === 'blank' && 'slip-hide-data',
          )}
        >
          {layout === 'a5' ? (
            <SlipForm receipt={receipt} />
          ) : (
            <>
              <div className="slip-copy flex h-[140mm] overflow-hidden p-[4mm]">
                <SlipForm receipt={receipt} />
              </div>
              <div className="slip-cut relative my-1 border-t border-dashed border-slate-400">
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 text-[8px] text-slate-400">
                  ✂ kesme çizgisi
                </span>
              </div>
              <div className="slip-copy flex h-[140mm] overflow-hidden p-[4mm]">
                <SlipForm receipt={receipt} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Başlıktaki "ETİKET : değer" satırı (noktalı doldurma çizgili). */
function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1 text-[9px]">
      <span className="w-[118px] shrink-0 text-right font-bold text-slate-700">{label}</span>
      <span className="text-slate-400">:</span>
      <span className="slip-data flex-1 border-b border-dotted border-slate-400 font-semibold text-slate-900">
        {value || ' '}
      </span>
    </div>
  );
}

/** Alıcı/Gönderen bloğundaki "ETİKET : değer" satırı. */
function FieldLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-1 flex items-baseline gap-1 text-[9px]">
      <span className="w-[66px] shrink-0 font-semibold text-slate-600">{label}</span>
      <span className="text-slate-400">:</span>
      <span className="slip-data flex-1 border-b border-dotted border-slate-400 text-slate-900">
        {value || ' '}
      </span>
    </div>
  );
}

function QrLabelModal({
  pkg,
  customer,
  onClose,
}: {
  pkg: Package;
  customer?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs space-y-4 rounded-xl bg-white p-6 text-center">
        <div className="qr-print">
          <QRCodeSVG value={pkg.code} size={200} className="mx-auto" />
          <p className="mt-3 text-lg font-bold tracking-wide text-slate-900">{pkg.code}</p>
          <p className="text-sm text-slate-500">
            {PACKAGE_TYPE_LABELS[pkg.type]}
            {customer ? ` · ${customer}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Kapat
          </Button>
          <Button className="flex-1" onClick={() => window.print()}>
            Yazdır
          </Button>
        </div>
      </div>
    </div>
  );
}
