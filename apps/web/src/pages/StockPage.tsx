import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  PACKAGE_TYPE_LABELS,
  type Dispatch,
  type LoadEntryInput,
  type PackageType,
  type Paginated,
  type Receipt,
  type VehicleSummary,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { formatCount, formatDate, daysSince } from '../lib/format';
import { useVehicles } from '../lib/lookups';
import {
  Badge,
  Button,
  Card,
  Combobox,
  EmptyState,
  Field,
  Input,
  Modal,
  Spinner,
} from '../components/ui';

type QuickTarget = {
  receiptId: string;
  customerName: string;
  count: number; // palet ya da adet
  hasPackages: boolean;
  plannedVehicle?: VehicleSummary | null;
};

/**
 * Depo = YÜK PLANLAMA ekranı. Farklı müşterilerin ürünleri işaretlenip TEK araca
 * yüklenir → tek sevkiyat → tek taşıma irsaliyesinde hepsi görünür.
 * (Karttaki "Hemen Sevk Et" tek kabulü anında sevk eden kısayoldur; çoklu plan için
 * seçim kullanılır — aksi halde her kabul ayrı sevkiyat/irsaliye olurdu.)
 */
export function StockPage() {
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickTarget | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  // Seçim: palet id → işaretli, kalem id → miktar
  const [pkgSel, setPkgSel] = useState<Record<string, boolean>>({});
  const [lineQty, setLineQty] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['stock', { search }],
    queryFn: () =>
      api.get<Paginated<Receipt>>(
        `/receipts/stock?page=1&pageSize=100&search=${encodeURIComponent(search)}`,
      ),
  });

  const entries: LoadEntryInput[] = useMemo(
    () => [
      ...Object.entries(pkgSel)
        .filter(([, v]) => v)
        .map(([packageId]) => ({ packageId })),
      ...Object.entries(lineQty)
        .filter(([, q]) => q > 0)
        .map(([receiptLineId, qty]) => ({ receiptLineId, qty })),
    ],
    [pkgSel, lineQty],
  );

  // Seçim özeti — kaç kap, kaç adet, kaç müşteri, hangi alıcılar
  const sel = useMemo(() => {
    const customers = new Set<string>();
    const recipients = new Set<string>();
    for (const r of data?.items ?? []) {
      const picked =
        (r.packages ?? []).some((p) => pkgSel[p.id]) ||
        (r.lines ?? []).some((l) => (lineQty[l.id] ?? 0) > 0);
      if (picked) {
        if (r.customer?.name) customers.add(r.customer.name);
        for (const rc of r.recipients ?? []) if (rc.label) recipients.add(rc.label);
        if (r.recipientCustomer?.name) recipients.add(r.recipientCustomer.name);
      }
    }
    return {
      pkg: entries.filter((e) => e.packageId).length,
      qty: entries.reduce((s, e) => s + (e.qty ?? 0), 0),
      customers: [...customers],
      recipients: [...recipients],
    };
  }, [data, pkgSel, lineQty, entries]);

  const clear = () => {
    setPkgSel({});
    setLineQty({});
  };

  const totalPackages = data?.items.reduce((s, r) => s + (r.packages?.length ?? 0), 0) ?? 0;

  return (
    <div className="space-y-4 pb-28">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Depodakiler</h2>
        <p className="text-sm text-slate-500">
          Kabul edilmiş, henüz sevk edilmemiş ürünler
          {data ? ` · ${data.total} kayıt · ${totalPackages} etiketli paket` : ''}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Farklı müşterilerin ürünlerini işaretleyip <b>tek araca</b> yükleyebilirsiniz — hepsi tek
          taşıma irsaliyesinde görünür.
        </p>
      </div>

      <Input
        type="search"
        placeholder="Ara: müşteri, referans, irsaliye no..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Depo boş görünüyor" hint="Tamamlanan mal kabuller burada listelenir." />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((r) => {
            const wait = daysSince(r.completedAt);
            const pkgs = (r.packages ?? []).filter((p) => !p.dispatchedAt && !p.dispatchId);
            const hasPkg = (r.packages ?? []).length > 0;
            const total = (r.packages ?? []).length;
            const openLines = (r.lines ?? []).filter((l) => (l.remainingQty ?? 0) > 0);
            const itemQty = (r.lines ?? []).reduce((s, l) => s + (l.remainingQty ?? l.countedQty ?? 0), 0);
            const totalQty = (r.lines ?? []).reduce((s, l) => s + (l.countedQty ?? 0), 0);
            const canDispatch = hasPkg ? pkgs.length > 0 : itemQty > 0;
            const picked =
              pkgs.some((p) => pkgSel[p.id]) || openLines.some((l) => (lineQty[l.id] ?? 0) > 0);

            return (
              <Card key={r.id} className={clsx('space-y-2', picked && 'ring-2 ring-brand/40')}>
                <Link to={`/mal-kabul/${r.id}`} className="block space-y-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{r.customer?.name}</p>
                      <p className="text-xs text-slate-500">
                        {r.reference}
                        {r.waybillNo ? ` · İrs: ${r.waybillNo}` : ''}
                        {r.recipientCustomer?.name ? ` → ${r.recipientCustomer.name}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <WaitBadge days={wait} />
                      {r.deliveryBy && <DueBadge date={r.deliveryBy} />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    📅 Giriş: {formatDate(r.completedAt)}
                    {r.deliveryBy ? ` · Son teslim: ${formatDate(r.deliveryBy)}` : ''}
                  </p>
                </Link>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  {r.plannedVehicle ? (
                    <Badge className="bg-indigo-100 text-indigo-700">
                      🚚 {r.plannedVehicle.plate}
                      {r.plannedVehicle.trailerPlate ? ` / ${r.plannedVehicle.trailerPlate}` : ''}
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-slate-500">🚚 Araç belirsiz</Badge>
                  )}
                  <span className="text-sm font-medium text-slate-700">
                    {hasPkg ? (
                      <>
                        {formatCount(pkgs.length)}
                        {total > pkgs.length ? `/${formatCount(total)}` : ''} palet depoda
                      </>
                    ) : (
                      <>
                        {formatCount(itemQty)}
                        {totalQty > itemQty ? `/${formatCount(totalQty)}` : ''} adet depoda
                      </>
                    )}
                  </span>
                </div>

                {/* Yük planı seçimi — paletliyse kap, paletsizse ürün + miktar */}
                {canDispatch && (
                  <div className="rounded-lg bg-slate-50 p-2">
                    {hasPkg ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {pkgs.map((p) => (
                          <label
                            key={p.id}
                            className={clsx(
                              'flex cursor-pointer items-center gap-1.5 rounded border bg-white px-2 py-1 text-xs',
                              pkgSel[p.id] ? 'border-brand text-brand' : 'border-slate-200',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!!pkgSel[p.id]}
                              onChange={(e) => setPkgSel((s) => ({ ...s, [p.id]: e.target.checked }))}
                            />
                            {p.code}
                            <span className="text-slate-400">
                              {PACKAGE_TYPE_LABELS[p.type as PackageType] ?? p.type}
                            </span>
                          </label>
                        ))}
                        {pkgs.length > 1 && (
                          <button
                            onClick={() =>
                              setPkgSel((s) => {
                                const all = pkgs.every((p) => s[p.id]);
                                const next = { ...s };
                                pkgs.forEach((p) => (next[p.id] = !all));
                                return next;
                              })
                            }
                            className="text-xs font-medium text-brand"
                          >
                            {pkgs.every((p) => pkgSel[p.id]) ? 'Seçimi kaldır' : 'Tümünü seç'}
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
                                  className="h-6 w-6 rounded border border-slate-300 bg-white text-slate-600"
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
                                  className="h-6 w-6 rounded border border-slate-300 bg-white text-slate-600"
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => set(v === max ? 0 : max)}
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
                )}

                {canDispatch && (
                  <button
                    onClick={() =>
                      setQuick({
                        receiptId: r.id,
                        customerName: r.customer?.name ?? 'Müşteri',
                        count: hasPkg ? pkgs.length : itemQty,
                        hasPackages: hasPkg,
                        plannedVehicle: r.plannedVehicle,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                  >
                    🚚 Bu kabulün tamamını hemen sevk et
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Yük planı çubuğu — seçim yapılınca altta sabitlenir */}
      {entries.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:pl-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-semibold text-slate-900">
                Seçili: {sel.pkg ? `${formatCount(sel.pkg)} kap` : ''}
                {sel.pkg && sel.qty ? ' · ' : ''}
                {sel.qty ? `${formatCount(sel.qty)} adet` : ''}
              </span>
              <span className="ml-2 text-xs text-slate-500">
                {sel.customers.length} müşteri
                {sel.customers.length > 1 ? ` (${sel.customers.join(', ')})` : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={clear}>
                Temizle
              </Button>
              <Button onClick={() => setPlanOpen(true)}>🚚 Araca Yükle</Button>
            </div>
          </div>
        </div>
      )}

      {planOpen && (
        <LoadToVehicleModal
          entries={entries}
          summary={sel}
          onClose={() => setPlanOpen(false)}
          onDone={clear}
        />
      )}
      {quick && <QuickDispatchModal target={quick} onClose={() => setQuick(null)} />}
    </div>
  );
}

/**
 * Seçilen yükleri bir araca yükler: mevcut TASLAK sevkiyata ekler ya da yeni sefer açar.
 * Böylece farklı müşterilerin malı tek sevkiyatta → tek taşıma irsaliyesinde toplanır.
 */
function LoadToVehicleModal({
  entries,
  summary,
  onClose,
  onDone,
}: {
  entries: LoadEntryInput[];
  summary: { pkg: number; qty: number; customers: string[]; recipients: string[] };
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState('');
  const [draftId, setDraftId] = useState(''); // boş = yeni sefer
  // Sefer adı KISA olmalı (ör. "Avrupa Yakası", "Kocaeli"). Tüm alıcı adlarını
  // birleştirmek okunmaz bir başlık üretiyordu — tek alıcı varsa onun adı, yoksa boş bırak.
  const [destination, setDestination] = useState(
    summary.recipients.length === 1 ? summary.recipients[0] : '',
  );

  // Devam eden yük planları (taslak sevkiyatlar)
  const { data: drafts } = useQuery({
    queryKey: ['dispatches', { status: 'DRAFT', forPlan: true }],
    queryFn: () => api.get<Paginated<Dispatch>>('/dispatches?page=1&pageSize=50&status=DRAFT'),
  });

  const mut = useMutation({
    mutationFn: async () => {
      let id = draftId;
      if (!id) {
        const created = await api.post<Dispatch>('/dispatches', {
          destination:
            destination.trim() ||
            (summary.customers.length > 1 ? `Karma sefer (${summary.customers.length} müşteri)` : 'Sefer'),
          vehicleId: vehicleId || undefined,
        });
        id = created.id;
      }
      return api.post<Dispatch>(`/dispatches/${id}/items`, { items: entries });
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      toast(`🚚 Yük ${d.reference} sefer planına eklendi`);
      onDone();
      onClose();
      navigate(`/sevkiyat/${d.id}`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Yüklenemedi'),
  });

  const draftOptions = (drafts?.items ?? []).map((d) => ({
    value: d.id,
    label: `${d.reference}${d.vehicle?.plate ? ` · ${d.vehicle.plate}` : ''} · ${d.destination}`,
  }));

  return (
    <Modal
      title="Araca Yükle"
      description={`${summary.pkg ? `${formatCount(summary.pkg)} kap` : ''}${summary.pkg && summary.qty ? ' · ' : ''}${
        summary.qty ? `${formatCount(summary.qty)} adet` : ''
      } · ${summary.customers.join(', ')}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {draftOptions.length > 0 && (
          <Field label="Devam eden sefer planı (varsa)">
            <Combobox
              options={draftOptions}
              value={draftId}
              onChange={setDraftId}
              nullable
              nullableLabel="Yeni sefer oluştur"
              placeholder="Taslak sevkiyat seç..."
            />
          </Field>
        )}

        {!draftId && (
          <>
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
            <Field label="Sefer adı / Gideceği bölge">
              <Input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Örn. Avrupa Yakası, Kocaeli, Çorlu"
              />
            </Field>
            <p className="-mt-1 text-xs text-slate-400">
              Kısa tutun — alıcılar zaten yük listesinden ve duraklardan geliyor.
            </p>
            {!vehicleId && (
              <p className="text-xs text-amber-600">
                Araç şimdi seçilmezse sevkiyat detayından sonra da atanabilir.
              </p>
            )}
          </>
        )}

        <p className="text-xs text-slate-400">
          Yük <b>taslak</b> sefere eklenir. Sevkiyat ekranında durakları belirleyip irsaliyeyi
          bastıktan sonra "Sevk Et" dersiniz.
        </p>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" className="flex-1" loading={mut.isPending} onClick={() => mut.mutate()}>
            {draftId ? 'Sefere Ekle' : 'Sefer Oluştur ve Yükle'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Depo kartından tek adım sevk: plaka elle girilmez, planlanan araç ön-seçili gelir.
 * Araç değişmişse burada farklı bir kayıtlı araç seçilir (plan ayrıca düzenlenmez).
 */
function QuickDispatchModal({ target, onClose }: { target: QuickTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: vehicles } = useVehicles();
  const [vehicleId, setVehicleId] = useState(target.plannedVehicle?.id ?? '');

  const mut = useMutation({
    mutationFn: () =>
      api.post<Dispatch>('/dispatches/quick', {
        receiptId: target.receiptId,
        vehicleId: vehicleId || undefined,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      toast(
        target.hasPackages
          ? `🚚 ${target.count} palet sevk edildi · ${d.reference}`
          : `🚚 Sevk edildi · ${d.reference}`,
      );
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Sevk edilemedi'),
  });

  return (
    <Modal
      title="Hemen Sevk Et"
      description={`${target.customerName}${target.hasPackages ? ` · ${target.count} palet` : ''}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          Bu kabulün <b>tamamı</b> ayrı bir sefer olarak anında sevk edilir. Başka müşterilerin malıyla
          aynı araca yüklemek istiyorsanız bunun yerine listeden seçip <b>"Araca Yükle"</b> kullanın.
        </p>
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
        {target.plannedVehicle && vehicleId === target.plannedVehicle.id && (
          <p className="text-xs text-green-600">✓ Ön ihbarda planlanan araç seçili.</p>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!vehicleId}
            loading={mut.isPending}
            onClick={() => mut.mutate()}
          >
            🚚 Sevk Et{target.hasPackages ? ` (${target.count})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Termin rozeti — ön ihbardaki SON TESLİM tarihine kalan gün.
 * Depo ekranının asıl sorusu "hangi yükü önce yükleyeyim"; bekleme süresi bunu tek başına
 * söylemiyordu (3 gündür bekleyen yükün termini yarın, 10 gündür bekleyenin haftaya olabilir).
 */
function DueBadge({ date }: { date: string }) {
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  const cls =
    days < 0
      ? 'bg-red-100 text-red-700'
      : days <= 1
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  const text =
    days < 0 ? `${Math.abs(days)} gün GECİKTİ` : days === 0 ? 'Bugün teslim' : `${days} gün kaldı`;
  return <Badge className={cls}>⏳ {text}</Badge>;
}

function WaitBadge({ days }: { days: number }) {
  const cls =
    days >= 7
      ? 'bg-red-100 text-red-700'
      : days >= 3
        ? 'bg-amber-100 text-amber-700'
        : 'bg-green-100 text-green-700';
  return <Badge className={cls}>{days === 0 ? 'Bugün' : `${days} gündür`}</Badge>;
}
