import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import {
  upsertReceiptLineSchema,
  PACKAGE_TYPE_LABELS,
  KAP_TYPES,
  PACKAGE_TYPES,
  DISCREPANCY_TYPE_LABELS,
  VAT_RATE,
  CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  trUpper,
  type Currency,
  type Receipt,
  type ReceiptLine,
  type UpsertReceiptLineInput,
  type Package,
  type DiscrepancyType,
} from '@lojistik/shared';
import { api, ApiError, assetUrl, uploadFiles } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useCustomerLocations, useCustomers, useVehicles, useWarehouses } from '../lib/lookups';
import { isNativeApp } from '../lib/config';
import { formatCount, formatDate, formatDateTime, formatMoney, formatWeight } from '../lib/format';
import { COMPANY } from '../lib/company';
import { toast } from '../lib/toast';
import { confirmDialog } from '../lib/dialog';
import {
  Badge,
  Button,
  Card,
  CollapsibleCard,
  Combobox,
  Field,
  Input,
  MultiCombobox,
  RowAction,
  Select,
  Spinner,
  type ComboOption,
} from '../components/ui';
import { Icon } from '../components/icons';
import { ReceiptStatusBadge } from '../components/ReceiptStatusBadge';
import { DiscrepancyModal } from '../components/DiscrepancyModal';
import { NativeCamera } from '../components/NativeCamera';
import { ImageLightbox, type LightboxImage } from '../components/ImageLightbox';
import { HistoryCard } from '../components/HistoryCard';
import { PrintableDocModal, type CopyOption } from '../components/print/PrintableDocModal';
import { MetaLine, FieldLine } from '../components/print/FormLines';

/** Kendi depolarımızın değer öneki — müşteri lokasyonu id'siyle karışmasın (ikisi de cuid). */
const WH_PREFIX = 'wh:';

/** Fişteki KAP hücresi: kalemin nev'i. Enum geldiyse (eski/otomatik kayıt) etikete çevir,
 *  ham 'ADET' değerini okunur yaz, boşsa hücre boş kalsın (elle doldurulur). */
function kapLabel(unit: string | null | undefined): string {
  const u = (unit ?? '').trim();
  if (!u) return '';
  // Fişteki diğer veriler BÜYÜK HARF → kap adı da büyütülür.
  return trUpper(PACKAGE_TYPE_LABELS[u as keyof typeof PACKAGE_TYPE_LABELS] ?? u);
}

export function ReceiptCountPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
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
  // Tutanak fotoğrafları tam ekran açılır (görseller tutanak başına gruplanır)
  const [photoView, setPhotoView] = useState<{ images: LightboxImage[]; index: number } | null>(
    null,
  );

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
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Tamamlanamadı'),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receipts'] });
      toast('Mal kabul iptal edildi.');
      navigate('/mal-kabul', { replace: true });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'İptal edilemedi'),
  });

  const reopenMut = useMutation({
    mutationFn: () => api.post<Receipt>(`/receipts/${id}/reopen`),
    onSuccess: (r) => {
      setReceipt(r);
      qc.invalidateQueries({ queryKey: ['receipts'] });
      toast('Mal kabul geri açıldı; düzenleyebilirsiniz.');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Geri açılamadı'),
  });

  const packageMut = useMutation({
    mutationFn: (body: { type: string; count: number }) =>
      api.post<Package[]>(`/receipts/${id}/packages`, body),
    onSuccess: (pkgs) => {
      qc.invalidateQueries({ queryKey: ['receipts', id] });
      toast(`${pkgs.length} etiket üretildi`);
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
  // Ticari alanlar ofisin işi; uç da @Roles(ADMIN, SUPERVISOR) ile kısıtlı
  const isOffice = role === 'ADMIN' || role === 'SUPERVISOR';
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
              {receipt.recipientCustomer ? ` → ${receipt.recipientCustomer.name}` : ''}
            </p>
          </div>
          <ReceiptStatusBadge status={receipt.status} />
        </div>
        {/* Geriye dönük sorgulamanın iki temel sorusu: kim teslim aldı, hangi plakayla çıktı */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>
            Teslim alan:{' '}
            <b className="text-slate-700">{receipt.startedBy?.fullName ?? 'bilinmiyor'}</b>
            {' · '}
            {formatDateTime(receipt.startedAt)}
          </span>
          <span>
            Sevkiyat:{' '}
            {receipt.dispatches?.length ? (
              receipt.dispatches.map((d, n) => (
                <span key={d.id}>
                  {n > 0 && ', '}
                  <Link to={`/sevkiyat/${d.id}`} className="font-semibold text-brand">
                    {d.plate ?? d.reference}
                  </Link>
                  {d.dispatchedAt ? ` (${formatDate(d.dispatchedAt)})` : ' (taslak)'}
                </span>
              ))
            ) : (
              <b className="text-slate-700">depoda</b>
            )}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Toplam sayılan</span>
          <span className="font-semibold">
            {formatCount(totalCounted)}
            {totalExpected ? ` / ${formatCount(totalExpected)}` : ''} adet
          </span>
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setSlipOpen(true)}>
          <Icon name="printer" className="h-4 w-4" /> Tesellüm Fişi
        </Button>
      </Card>

      {/* ASIL İŞ: sayım. Sayfanın en üstünde ve tek açık bölüm — ikincil kartlar altta
          katlanmış durur, böylece ekran açıldığında operatör doğrudan işine bakar. */}
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">Kalemler ({receipt.lines.length})</h3>
          {editable && (
            <Button
              variant="secondary"
              onClick={() => {
                setPrefill({});
                setAddOpen(true);
              }}
            >
              + Kalem
            </Button>
          )}
        </div>
        {receipt.lines.length === 0 ? (
          <p className="py-2 text-center text-sm text-slate-400">
            Henüz kalem yok. "+ Kalem" ile satır girin.
          </p>
        ) : (
          <div className="space-y-2">
            {receipt.lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                editable={editable}
                onSetCount={setCount}
                onReport={(type) => setDiscrepancyFor({ lineId: line.id, type })}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Belge bilgileri — dolmamışsa açık gelir (girilmesi gereken bir iş), doluysa kapalı */}
      <CollapsibleCard
        title="Belge Bilgileri"
        summary={
          receipt.waybillNo || receipt.orderNo
            ? [receipt.waybillNo && `İrs: ${receipt.waybillNo}`, receipt.orderNo && `Sip: ${receipt.orderNo}`]
                .filter(Boolean)
                .join(' · ')
            : 'girilmedi'
        }
        defaultOpen={editable && !receipt.waybillNo && !receipt.orderNo}
      >
        <DocumentEditor
          receiptId={receipt.id}
          initialWaybill={receipt.waybillNo ?? ''}
          initialOrder={receipt.orderNo ?? ''}
          editable={editable}
        />
      </CollapsibleCard>

      {/* Ticari/taraf bilgileri — depocu değil OFİS doldurur, o yüzden yalnız
          yönetici/şef görür. Depocunun ekranı sade kalsın. */}
      {isOffice && (
        <CollapsibleCard
          title="Ticari Bilgiler"
          summary={
            receipt.recipientCustomer?.name ??
            (receipt.recipients?.[0]?.label || 'alıcı girilmedi')
          }
          defaultOpen={!receipt.recipientCustomerId}
        >
          <CommercialEditor receipt={receipt} />
        </CollapsibleCard>
      )}

      <CollapsibleCard
        title="İrsaliye Görüntüleri"
        summary={
          receipt.attachments?.length ? `${receipt.attachments.length} görüntü` : 'foto eklenmedi'
        }
        defaultOpen={editable && (receipt.attachments?.length ?? 0) === 0}
      >
        <AttachmentsCard receipt={receipt} editable={editable} />
      </CollapsibleCard>

      {/* QR etiketleri */}
      <CollapsibleCard
        title="QR Etiketler"
        summary={`${receipt.packages?.length ?? 0} etiket`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Palet/koli etiketi üret</span>
          {receipt.packages && receipt.packages.length > 0 && (
            <Button variant="secondary" onClick={() => setLabelsPrintOpen(true)}>
              <Icon name="printer" className="h-4 w-4" /> Tümünü Yazdır
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
      </CollapsibleCard>

      {/* Tutanak VARSA açık gelir: eksik/hasar operatörün görmesi gereken bir uyarıdır */}
      <CollapsibleCard
        title="Tutanaklar"
        summary={`${receipt.discrepancies?.length ?? 0} kayıt`}
        defaultOpen={(receipt.discrepancies?.length ?? 0) > 0}
        action={
          editable && (
            <Button variant="secondary" onClick={() => setDiscrepancyFor({})}>
              + Tutanak
            </Button>
          )
        }
      >
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
                    <RowAction
                      icon="trash"
                      label="Sil"
                      tone="danger"
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
                    />
                  )}
                </div>
                {d.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.attachments.map((a, idx) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() =>
                          setPhotoView({
                            images: d.attachments.map((x) => ({
                              url: assetUrl(x.url),
                              alt: x.fileName,
                            })),
                            index: idx,
                          })
                        }
                      >
                        <img
                          src={assetUrl(a.url)}
                          alt={a.fileName}
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                      </button>
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
      </CollapsibleCard>

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
          currency={receipt.currency}
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
      <HistoryCard path={`/receipts/${receipt.id}/history`} />

      {photoView && (
        <ImageLightbox
          images={photoView.images}
          startIndex={photoView.index}
          onClose={() => setPhotoView(null)}
        />
      )}
    </div>
  );
}

/**
 * Ticari/taraf bilgileri — OFİS doldurur (yönetici/şef).
 *
 * Bu alanlar eskiden ön ihbardaydı. Akış mal kabulle başladığı için buraya
 * taşındı: depocu malı indirirken yalnız gönderici/alıcı/kalem girer, fiyat ve
 * ödeme şartlarını ofis sonradan tamamlar. Alıcı burada da doldurulabilir —
 * gelen irsaliyede nihai firma her zaman yazmıyor.
 */
function CommercialEditor({ receipt }: { receipt: Receipt }) {
  const qc = useQueryClient();
  const { data: customers } = useCustomers();
  const { data: warehouses } = useWarehouses();
  const { data: vehicles } = useVehicles();

  const [recipientId, setRecipientId] = useState(receipt.recipientCustomerId ?? '');
  const [vehicleId, setVehicleId] = useState(receipt.plannedVehicleId ?? '');
  const [deliveryBy, setDeliveryBy] = useState(receipt.deliveryBy?.slice(0, 10) ?? '');
  const [currency, setCurrency] = useState<Currency>(receipt.currency ?? 'TRY');
  const [paymentType, setPaymentType] = useState<'SENDER' | 'RECIPIENT'>(
    receipt.paymentType ?? 'SENDER',
  );
  const [vatIncluded, setVatIncluded] = useState(receipt.vatIncluded ?? false);
  const [showAmount, setShowAmount] = useState(receipt.showAmountOnSlip ?? false);

  const toOption = (p: { customerLocationId?: string | null; warehouseId?: string | null; label: string }, i: number) => ({
    value: p.warehouseId ? `${WH_PREFIX}${p.warehouseId}` : (p.customerLocationId ?? `__ft_${i}`),
    label: p.label,
  });
  const [sourceSel, setSourceSel] = useState<ComboOption[]>(
    (receipt.sources ?? []).map(toOption),
  );
  const [dropSel, setDropSel] = useState<ComboOption[]>((receipt.recipients ?? []).map(toOption));

  // Yükleme yeri göndericinin, boşaltma yeri ALICININ lokasyonlarından seçilir
  const { data: srcLocations } = useCustomerLocations(receipt.customerId);
  const { data: dropLocations } = useCustomerLocations(recipientId || undefined);

  const mut = useMutation({
    mutationFn: () =>
      api.patch<Receipt>(`/receipts/${receipt.id}/commercial`, {
        recipientCustomerId: recipientId || null,
        plannedVehicleId: vehicleId || null,
        deliveryBy: deliveryBy || null,
        currency,
        paymentType,
        vatIncluded,
        showAmountOnSlip: showAmount,
        sources: sourceSel.map((o) =>
          o.value.startsWith(WH_PREFIX)
            ? { warehouseId: o.value.slice(WH_PREFIX.length), label: o.label }
            : { customerLocationId: o.value.startsWith('__ft_') ? undefined : o.value, label: o.label },
        ),
        recipients: dropSel.map((o) => ({
          customerLocationId: o.value.startsWith('__ft_') ? undefined : o.value,
          label: o.label,
        })),
      }),
    onSuccess: (r) => {
      qc.setQueryData(['receipts', receipt.id], r);
      toast('Ticari bilgiler kaydedildi');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Kaydedilemedi'),
  });

  const customerOptions = (customers ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    hint: `(${c.code})`,
  }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Alıcı">
          <Combobox
            options={customerOptions}
            value={recipientId}
            onChange={(v) => {
              setRecipientId(v);
              setDropSel([]); // boşaltma yerleri alıcıya bağlı
            }}
            nullable
            nullableLabel="Bilinmiyor"
            placeholder="Alıcı ara / seç..."
          />
        </Field>
        <div className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Boşaltma Yeri</span>
          <MultiCombobox
            options={(dropLocations ?? []).map((l) => ({ value: l.id, label: l.name }))}
            value={dropSel}
            onChange={(v) => setDropSel(v.slice(-1))} // tek nokta: bir kabul tek yere iner
            disabled={!recipientId}
            placeholder={recipientId ? 'Boşaltma yeri seç…' : 'Önce alıcı seçin'}
          />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium text-slate-700">Yükleme Yeri</span>
        <MultiCombobox
          options={[
            ...(srcLocations ?? []).map((l) => ({ value: l.id, label: l.name })),
            ...(warehouses ?? []).map((w) => ({
              value: `${WH_PREFIX}${w.id}`,
              label: w.name,
              hint: '· bizim depomuz',
            })),
          ]}
          value={sourceSel}
          onChange={setSourceSel}
          placeholder="Yükleme yeri seç…"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Planlanan Araç">
          <Combobox
            options={(vehicles ?? []).map((v) => ({ value: v.id, label: v.plate }))}
            value={vehicleId}
            onChange={setVehicleId}
            nullable
            nullableLabel="Belirsiz"
            placeholder="Plaka seç..."
          />
        </Field>
        <Field label="Son Teslim (Termin)">
          <Input type="date" value={deliveryBy} onChange={(e) => setDeliveryBy(e.target.value)} />
        </Field>
        <Field label="Para Birimi">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {/* Gönderici ödemeli solda ve varsayılan */}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={paymentType === 'SENDER'}
            onChange={() => setPaymentType('SENDER')}
          />
          Gönderici ödemeli
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={paymentType === 'RECIPIENT'}
            onChange={() => setPaymentType('RECIPIENT')}
          />
          Alıcı ödemeli
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={vatIncluded}
            onChange={(e) => setVatIncluded(e.target.checked)}
          />
          Fiyatlar KDV dahil
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showAmount}
            onChange={(e) => setShowAmount(e.target.checked)}
          />
          Fişte ücret görünsün
        </label>
      </div>

      <Button className="w-full" loading={mut.isPending} onClick={() => mut.mutate()}>
        Kaydet
      </Button>
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

  // Tamamlanmış ve her iki alan da boşsa hiç gösterme
  if (!editable && !initialWaybill && !initialOrder) return null;

  // OCR burada YOK: numaralar teslim alma anında irsaliye fotoğrafından okunuyor
  // (ReceiptStartPage). Burası yalnızca düzeltme yeri.
  return (
    <div className="space-y-3">
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
    </div>
  );
}

/** İrsaliye/belge görüntüleri — çoklu foto yükle, galeri göster, sil.
 *  (OCR yok; buradaki fotolar yalnızca belge kaydı olarak saklanır.) */
function AttachmentsCard({ receipt, editable }: { receipt: Receipt; editable: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const attachments = receipt.attachments ?? [];

  const uploadMut = useMutation({
    mutationFn: (files: File[]) =>
      uploadFiles<Receipt>(`/receipts/${receipt.id}/attachments`, files),
    onSuccess: (r) => {
      qc.setQueryData(['receipts', receipt.id], r);
      toast(`${(r.attachments?.length ?? 0) - attachments.length} görüntü eklendi`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Yüklenemedi'),
  });

  const removeMut = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete<Receipt>(`/receipts/${receipt.id}/attachments/${attachmentId}`),
    onSuccess: (r) => qc.setQueryData(['receipts', receipt.id], r),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Silinemedi'),
  });

  // APK içinde <input capture> arka kamerayı açtıramıyor ve odaklamıyor (bulanık
  // foto) — native'de CameraX'li önizlemeye düşeriz, tarayıcıda dosya/kamera
  // diyaloğu zaten yeterli. Aynı ayrım "İrsaliye No Oku"da da var.
  const [cameraOpen, setCameraOpen] = useState(false);
  const native = isNativeApp();
  // Tam ekran görüntüleyicide açık olan görselin sırası (null = kapalı)
  const [viewer, setViewer] = useState<number | null>(null);

  // Tamamlanmış ve hiç görüntü yoksa gizle
  if (!editable && attachments.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">Belge fotoğrafları</span>
        {editable && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) uploadMut.mutate(files);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={uploadMut.isPending}
              onClick={() => (native ? setCameraOpen(true) : fileRef.current?.click())}
            >
              <Icon name="camera" className="h-4 w-4" /> Görüntü Ekle
            </Button>
          </>
        )}
      </div>
      {cameraOpen && (
        <NativeCamera
          title="İrsaliye Fotoğrafı"
          guide="İrsaliyenin tamamı kadrajda olsun"
          busyLabel="Yükleniyor…"
          onClose={() => setCameraOpen(false)}
          onCapture={async (file) => {
            await uploadMut.mutateAsync([file]);
            return null;
          }}
        />
      )}
      {viewer !== null && (
        <ImageLightbox
          images={attachments.map((a) => ({ url: assetUrl(a.url), alt: a.fileName }))}
          startIndex={viewer}
          onClose={() => setViewer(null)}
        />
      )}
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, idx) => (
            <div key={a.id} className="relative">
              <button type="button" onClick={() => setViewer(idx)}>
                <img
                  src={assetUrl(a.url)}
                  alt={a.fileName}
                  className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                />
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        message: 'Görüntü silinsin mi?',
                        confirmText: 'Sil',
                        danger: true,
                      })
                    )
                      removeMut.mutate(a.id);
                  }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
                  aria-label="Sil"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">
          İrsaliyenin/belgenin fotoğrafını ekleyin (birden fazla eklenebilir).
        </p>
      )}
    </div>
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
          </p>
        </div>
        <div className="text-right text-sm">
          <span className="font-bold text-slate-900">{line.countedQty}</span>
          {expected != null && <span className="text-slate-400"> / {expected}</span>}
          <span className="ml-1 text-xs text-slate-400">{line.unit}</span>
          {line.weightKg != null && (
            <span className="block text-xs text-slate-400">{formatWeight(line.weightKg)} kg</span>
          )}
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
  currency,
  onClose,
  onSubmit,
}: {
  prefill: { sku?: string; barcode?: string; description?: string; qty?: number };
  currency?: string;
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
      unit: 'Palet',
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
          <Field label="Malın Cinsi *" error={errors.description?.message}>
            <Input placeholder="Örn. Boya, Tiner" {...register('description')} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Adet *" error={errors.countedQty?.message}>
              <Input type="number" min={0} {...register('countedQty')} />
            </Field>
            {/* NEVİ = kap tipi; taşıma irsaliyesindeki NEVİ sütununa basılır */}
            <Field label="Nevi (kap) *" error={errors.unit?.message}>
              <Select {...register('unit')}>
                {KAP_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Kalemin TOPLAM kilosu — fişteki KG, irsaliyedeki KİLO sütununa basılır */}
            <Field label="Kilo (kg)" error={errors.weightKg?.message}>
              <Input type="number" min={0} step="0.001" placeholder="0" {...register('weightKg')} />
            </Field>
            {/* Birim fiyat — ön ihbarda kalem girilmediyse fiyatın girilebileceği tek yer */}
            <Field
              label={`Birim Fiyat (${CURRENCY_SYMBOLS[(currency ?? 'TRY') as Currency] ?? '₺'})`}
              error={errors.unitPrice?.message}
            >
              <Input type="number" min={0} step="0.01" placeholder="0" {...register('unitPrice')} />
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
          <Button onClick={() => window.print()}>
            <Icon name="printer" className="h-4 w-4" /> Yazdır
          </Button>
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

// Nüsha etiketi (matbu/chrome — matbaa master'ında görünür, "yalnız veri" baskısında gizli).
// 3 nüshalı karbonsuz koçan için matbaaya her nüsha ayrı ayrı bastırılır.
// Yol: asıl (beyaz) alıcıya, orta (pembe) taşıyıcıda, dip (sarı) bizde (dosya) kalır.
const SLIP_COPIES: CopyOption[] = [
  { key: 'none', label: 'Nüsha yok', badge: '' },
  { key: 'c1', label: '1· Alıcı', badge: '1. NÜSHA · ALICI' },
  { key: 'c2', label: '2· Taşıyıcı', badge: '2. NÜSHA · TAŞIYICI' },
  { key: 'c3', label: '3· Dosya', badge: '3. NÜSHA · DOSYA' },
];

/** Matbu formdaki SABİT mal satırı sayısı. Matbaa master'ı da günlük veri baskısı da bu
 *  kapasiteye kilitli — geometri her modda aynı kalmazsa matbu forma hizalama bozulur. */
const FORM_ROWS = 5;

/** Çoklu yükleme/boşaltma noktalarının adları — A5'e sığsın diye yalnız ad, adres yok.
 *  (Adresler firma bloğunda ADRESİ satırında; nokta adresleri müşteri detayında.) */
function pointLabels(points?: { label: string }[]): string {
  if (!points?.length) return '';
  return points.map((p) => p.label).join(' · ');
}

/** Fişin görsel gövdesi — tek bir A5 form (yatay).
 *  `blank`=matbaa master: satır sayısı fişteki veriye göre DEĞİŞMEMELİ, hep FORM_ROWS. */
function SlipForm({
  receipt,
  copyBadge = '',
  blank = false,
}: {
  receipt: Receipt;
  copyBadge?: string;
  blank?: boolean;
}) {
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

  // Master'da satırlar fişten bağımsız; günlük baskıda satırlar FORM_ROWS'a tamamlanır.
  const lines = blank ? [] : receipt.lines;
  const blanks = Math.max(0, FORM_ROWS - lines.length);
  const th = 'border border-sky-800 px-1 py-0.5 text-[8px] font-bold uppercase text-sky-800';
  const td = 'border border-sky-800 px-1 py-1 align-top';

  // QR = fişi uygulamada açan link (okutunca mal kabul kaydı gelir)
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slipUrl = origin ? `${origin}/mal-kabul/${receipt.id}` : receipt.reference;
  const logoUrl = origin ? `${origin}${COMPANY.logoPath}` : COMPANY.logoPath;

  /**
   * Ücret fişte YALNIZ ön ihbarda işaretlenmişse basılır — varsayılan GİZLİ.
   *
   * Eski koşul `paymentType === 'RECIPIENT' || (SENDER && showAmountOnSlip)` idi; ödeme
   * varsayılanı "Alıcı ödemeli" olduğu için ücret kutucuktan BAĞIMSIZ hep basılıyordu ve
   * kutucuk o durumda pasif olduğu için kapatılamıyordu. Artık tek anahtar var.
   */
  const showAmount = !!receipt.showAmountOnSlip;
  const lineAmount = (l: ReceiptLine) => (l.unitPrice != null ? l.countedQty * l.unitPrice : null);
  const hasPrice = receipt.lines.some((l) => l.unitPrice != null);
  const subtotal = receipt.lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0);
  // Toplam kilo — hiçbir kalemde girilmemişse null (hücre boş kalır, elle yazılır)
  const totalKg = lines.reduce<number | null>(
    (sum, l) => (l.weightKg == null ? sum : (sum ?? 0) + l.weightKg),
    null,
  );
  // Tutarlar ön ihbarda seçilen para biriminden basılır (kur dönüşümü yok)
  const cur = receipt.currency ?? 'TRY';
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
          {copyBadge && (
            <div className="mb-0.5 self-end rounded-sm border border-sky-800 px-1.5 py-0.5 text-[8px] font-black tracking-wide text-sky-800">
              {copyBadge}
            </div>
          )}
          <h1 className="text-right text-base font-black tracking-wide text-sky-800">
            AMBAR TESELLÜM FİŞİ
          </h1>
          <div className="mt-1 space-y-0.5">
            <MetaLine label="SERİ / SIRA NO" value={receipt.reference} />
            <MetaLine label="TARİH" value={formatDate(receipt.completedAt ?? receipt.startedAt)} />
            <MetaLine label="GÖNDERİCİ SEVK İRS. NO" value={receipt.waybillNo || ''} />
            <MetaLine label="SİPARİŞ NO" value={receipt.orderNo || ''} />
            <MetaLine label="ÖN İHBAR" value={receipt.asnReference || 'Kör kabul'} />
          </div>
        </div>
      </div>

      {/* GÖNDEREN + mal tablosu */}
      <div className="flex border-b-2 border-sky-800">
        <div className="w-[42%] border-r-2 border-sky-800 p-2">
          <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Gönderen / Sender</p>
          <FieldLine
            label="ADI, ÜNVANI"
            // Belgede TAM ÜNVAN; girilmemişse kısa ad
            value={`${receipt.customer?.legalName || receipt.customer?.name || ''}${
              receipt.customer?.code ? ` (${receipt.customer.code})` : ''
            }`}
            lines={2}
          />
          <FieldLine label="V. DAİRESİ" value={receipt.customer?.taxOffice || ''} />
          <FieldLine label="V. NO" value={receipt.customer?.taxNumber || ''} />
          <FieldLine label="TEL" value={receipt.customer?.phone || ''} />
          {/* Çoklu yükleme noktası — koşulsuz basılır (boşken de), geometri sabit kalsın */}
          <FieldLine label="YÜKLEME YERİ" value={pointLabels(receipt.sources)} />
          {/* ADRESİ en sonda: uzunsa alttaki boşluğa sarar, hiçbir alanı itmez */}
          <FieldLine label="ADRESİ" value={receipt.customer?.address || ''} auto />
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
              {lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={`${td} text-center`}>
                    <span className="slip-data">{i + 1}</span>
                  </td>
                  <td className={td}>
                    <span className="slip-data">{l.description}</span>
                  </td>
                  <td className={`${td} text-right font-semibold`}>
                    <span className="slip-data">{formatCount(l.countedQty)}</span>
                  </td>
                  {/* KAP = kalemin nev'i (ön ihbarda seçilir); eski kayıtlarda boş/ham olabilir */}
                  <td className={`${td} text-center`}>
                    <span className="slip-data">{kapLabel(l.unit)}</span>
                  </td>
                  {/* KG = kalemin ağırlığı (ön ihbarda/mal kabulde girilir); boşsa elle yazılır */}
                  <td className={`${td} text-right`}>
                    <span className="slip-data">{formatWeight(l.weightKg)}</span>
                  </td>
                  <td className={`${td} text-right`}>
                    {showAmount && lineAmount(l) != null ? (
                      <span className="slip-data">{formatMoney(lineAmount(l), cur)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {Array.from({ length: blanks }).map((_, i) => (
                <tr key={`b${i}`}>
                  <td className={`${td} text-center text-slate-300`}>
                    <span className="slip-data">{lines.length + i + 1}</span>
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
                  <span className="slip-data">{formatCount(totalCounted)}</span>
                </td>
                <td className={td} colSpan={2}>
                  <span className="slip-data">
                    Palet/Koli: {formatCount(packages.length)}
                    {typeSummary ? ` · ${typeSummary}` : ''}
                    {totalKg != null ? ` · ${formatWeight(totalKg)} kg` : ''}
                  </span>
                </td>
                <td className={`${td} text-right font-bold`}>
                  {showAmount && hasPrice ? (
                    <span className="slip-data">{formatMoney(grand, cur)}</span>
                  ) : null}
                </td>
              </tr>
              {/* Tutar/KDV satırı HER modda render edilir (içi boşken  ): koşullu olsaydı
                  tablo yüksekliği değişir, matbu formla hizalama kayardı. */}
              <tr>
                <td className={`${td} text-right`} colSpan={6}>
                  <span className="slip-data text-[8px]">
                    {showAmount && hasPrice
                      ? vatIncluded
                        ? `Genel Toplam: ${formatMoney(grand, cur)} (KDV dahil)`
                        : `Ara Toplam: ${formatMoney(net, cur)} · KDV %20: ${formatMoney(vat, cur)} · Genel Toplam: ${formatMoney(grand, cur)}`
                      : ' '}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ALICI + ödeme + tesellüm beyanı */}
      <div className="flex flex-1">
        <div className="w-[42%] border-r-2 border-sky-800 p-2">
          <p className="mb-1 text-[9px] font-bold uppercase text-sky-800">Alıcı / Delivery</p>
          <FieldLine
            label="ADI, ÜNVANI"
            value={receipt.recipientCustomer?.legalName || receipt.recipientCustomer?.name || ''}
            lines={2}
          />
          <FieldLine label="V. DAİRESİ" value={receipt.recipientCustomer?.taxOffice || ''} />
          <FieldLine label="V. NO" value={receipt.recipientCustomer?.taxNumber || ''} />
          <FieldLine label="TEL" value={receipt.recipientCustomer?.phone || ''} />
          {/* Çoklu boşaltma noktası — koşulsuz basılır (boşken de), geometri sabit kalsın */}
          <FieldLine label="BOŞALTMA YERİ" value={pointLabels(receipt.recipients)} />
          {/* ADRESİ en sonda: uzunsa alttaki boşluğa sarar, hiçbir alanı itmez */}
          <FieldLine label="ADRESİ" value={receipt.recipientCustomer?.address || ''} auto />
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
  return (
    <PrintableDocModal
      title="Tesellüm Fişi"
      documentTitle={`Tesellum_${receipt.reference}`}
      pageSize="A5 landscape"
      copies={SLIP_COPIES}
      onClose={onClose}
      blankHint={
        <>
          3 nüshalı koçan için: <b>Nüsha</b>'yı sırayla <b>Alıcı → Taşıyıcı → Dosya</b> seçip her
          birini ayrı PDF'e basın; 3 dosyayı matbaaya verin (asıl/beyaz=Alıcı, orta/pembe=Taşıyıcı,
          dip/sarı=Dosya·bizde). Nüsha etiketi sağ üstte görünür. Master, açık fişten bağımsızdır:
          mal tablosu her zaman <b>{FORM_ROWS} satır</b>.
        </>
      }
      overflowWarning={
        receipt.lines.length > FORM_ROWS ? (
          <>
            ⚠ Bu fişte {receipt.lines.length} kalem var; matbu form {FORM_ROWS} satırlık. Fazla
            satırlar basılı kutuların dışına taşar — kalemleri birleştirin ya da sevkiyatı ikinci bir
            fişe bölün.
          </>
        ) : null
      }
    >
      {({ copyBadge, blank }) => <SlipForm receipt={receipt} copyBadge={copyBadge} blank={blank} />}
    </PrintableDocModal>
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
