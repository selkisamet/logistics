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
import { toast } from '../lib/toast';
import { Button, Card, Combobox, Field, Input, Spinner, Badge } from '../components/ui';
import { ReceiptStatusBadge } from '../components/ReceiptStatusBadge';
import { DiscrepancyModal } from '../components/DiscrepancyModal';

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
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Kayıt başarısız'),
  });

  const completeMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/complete`),
    onSuccess: (r) => {
      setReceipt(r);
      qc.invalidateQueries({ queryKey: ['receipts'] });
      qc.invalidateQueries({ queryKey: ['asn'] });
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Tamamlanamadı'),
  });

  const packageMut = useMutation({
    mutationFn: (body: { type: string; count: number }) =>
      api.post<Package[]>(`/receipts/${id}/packages`, body),
    onSuccess: (pkgs) => {
      qc.invalidateQueries({ queryKey: ['receipts', id] });
      toast(`🏷️ ${pkgs.length} etiket üretildi`);
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Etiket üretilemedi'),
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
                      onClick={() => {
                        if (confirm('Tutanak silinsin mi?')) deleteDiscrepancyMut.mutate(d.id);
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
          onClick={() => {
            const msg = hasDiscrepancy
              ? 'Beklenen ile sayılan arasında fark var. Yine de tamamlansın mı?'
              : 'Mal kabul tamamlansın mı?';
            if (confirm(msg)) completeMut.mutate();
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
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const ocrMut = useMutation({
    mutationFn: (file: File) => uploadSingle<WaybillExtraction>('/ocr/waybill', file),
    onSuccess: (res) => {
      if (res.waybillNo) setWaybill(res.waybillNo);
      if (res.orderNo) setOrder(res.orderNo);
      toast(
        res.waybillNo || res.orderNo
          ? "📄 Okundu — kontrol edip Kaydet'e basın"
          : 'Numara okunamadı — İrsaliye No net görünecek şekilde tekrar çekin.',
      );
    },
    onError: (err) => alert(err instanceof ApiError ? err.message : 'Okunamadı'),
  });

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
              onClick={() => fileRef.current?.click()}
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
