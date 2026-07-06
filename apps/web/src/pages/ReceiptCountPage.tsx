import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import {
  upsertReceiptLineSchema,
  PACKAGE_TYPE_LABELS,
  PACKAGE_TYPES,
  DISCREPANCY_TYPE_LABELS,
  type Receipt,
  type ReceiptLine,
  type UpsertReceiptLineInput,
  type Package,
  type DiscrepancyType,
  type WaybillExtraction,
} from '@lojistik/shared';
import { api, ApiError, assetUrl, uploadSingle } from '../lib/api';
import { isNativeApp } from '../lib/config';
import { formatDate, formatDateTime } from '../lib/format';
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

/** Tesellüm fişi: A5 yazdırılabilir belge (kalemler, palet özeti, imza, uyuşmazlıklar). */
function ReceiptSlipModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const totalCounted = receipt.lines.reduce((s, l) => s + l.countedQty, 0);
  const totalExpected = receipt.lines.reduce((s, l) => s + (l.expectedQty ?? 0), 0);
  const packages = receipt.packages ?? [];
  const discrepancies = receipt.discrepancies ?? [];

  // Palet/koli tip özeti: "5 Palet · 2 Koli"
  const typeCounts = packages.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] ?? 0) + 1;
    return acc;
  }, {});
  const typeSummary = Object.entries(typeCounts)
    .map(([t, n]) => `${n} ${PACKAGE_TYPE_LABELS[t as keyof typeof PACKAGE_TYPE_LABELS] ?? t}`)
    .join(' · ');

  const cell = 'px-1.5 py-1 align-top';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-100">
      {/* Araç çubuğu — yazdırmada gizli */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white p-4">
        <span className="font-semibold text-slate-900">Tesellüm Fişi · {receipt.reference}</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
          <Button onClick={() => window.print()}>🖨️ Yazdır</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="receipt-print mx-auto flex min-h-[210mm] w-[148mm] flex-col bg-white p-[8mm] text-[11px] leading-tight text-slate-900 shadow-lg">
          {/* Başlık */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-2">
            <div>
              <h1 className="text-lg font-black tracking-wide">TESELLÜM FİŞİ</h1>
              <p className="text-[11px] text-slate-600">
                {receipt.warehouse?.name ?? 'Depo'} · 3PL Mal Kabul
              </p>
            </div>
            <div className="text-center">
              <QRCodeSVG value={receipt.reference} size={62} />
              <p className="mt-1 text-[11px] font-bold">{receipt.reference}</p>
            </div>
          </div>

          {/* Künye bilgileri */}
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <SlipInfo label="Müşteri" value={`${receipt.customer?.name ?? '–'}${receipt.customer?.code ? ` (${receipt.customer.code})` : ''}`} />
            <SlipInfo label="Hedef Depo" value={receipt.warehouse?.name ?? '–'} />
            <SlipInfo label="İrsaliye No" value={receipt.waybillNo || '–'} />
            <SlipInfo label="Sipariş No" value={receipt.orderNo || '–'} />
            <SlipInfo label="Ön İhbar" value={receipt.asnReference || 'Kör kabul'} />
            <SlipInfo label="Tarih" value={formatDate(receipt.completedAt ?? receipt.startedAt)} />
          </div>

          {/* Kalemler */}
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr className="border-y border-slate-400 text-left text-[10px] uppercase text-slate-500">
                <th className={cell}>#</th>
                <th className={cell}>Açıklama</th>
                <th className={`${cell} text-right`}>Bekl.</th>
                <th className={`${cell} text-right`}>Sayılan</th>
                <th className={cell}>Birim</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-slate-200">
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}>{l.description}</td>
                  <td className={`${cell} text-right`}>{l.expectedQty ?? '–'}</td>
                  <td className={`${cell} text-right font-semibold`}>{l.countedQty}</td>
                  <td className={cell}>{l.unit}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-bold">
                <td className={cell} colSpan={2}>
                  Toplam
                </td>
                <td className={`${cell} text-right`}>{totalExpected || '–'}</td>
                <td className={`${cell} text-right`}>{totalCounted}</td>
                <td className={cell}>adet</td>
              </tr>
            </tfoot>
          </table>

          {/* Palet / koli özeti */}
          <div className="mt-3">
            <p className="font-semibold">
              Palet / Koli: {packages.length} adet{typeSummary ? ` · ${typeSummary}` : ''}
            </p>
            {packages.length > 0 && (
              <p className="mt-0.5 break-all text-[9px] text-slate-500">
                {packages.map((p) => p.code).join('  ·  ')}
              </p>
            )}
          </div>

          {/* Uyuşmazlıklar (varsa) */}
          {discrepancies.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-red-700">Uyuşmazlıklar ({discrepancies.length})</p>
              <ul className="mt-0.5 space-y-0.5">
                {discrepancies.map((d) => (
                  <li key={d.id} className="text-[10px]">
                    • {DISCREPANCY_TYPE_LABELS[d.type]}
                    {d.qty != null ? ` (${d.qty})` : ''}: {d.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {receipt.notes && (
            <p className="mt-3 text-[10px] text-slate-600">
              <span className="font-semibold">Not:</span> {receipt.notes}
            </p>
          )}

          {/* İmza alanları — sayfanın altına yaslı */}
          <div className="mt-auto grid grid-cols-2 gap-8 pt-10">
            <div className="border-t border-slate-500 pt-1 text-center text-[10px] text-slate-600">
              Teslim Eden
              <div className="text-[9px] text-slate-400">(Ad-Soyad / İmza)</div>
            </div>
            <div className="border-t border-slate-500 pt-1 text-center text-[10px] text-slate-600">
              Teslim Alan
              <div className="text-[9px] text-slate-400">(Ad-Soyad / İmza)</div>
            </div>
          </div>
          <p className="mt-2 text-center text-[8px] text-slate-400">
            {receipt.reference} · Yazdırma: {formatDateTime(new Date().toISOString())}
          </p>
        </div>
      </div>
    </div>
  );
}

function SlipInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="shrink-0 font-semibold text-slate-500">{label}:</span>
      <span className="text-slate-900">{value}</span>
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
