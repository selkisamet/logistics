import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  PENDING_REGION_LABEL,
  type Dispatch,
  type LoadEntryInput,
  type Paginated,
  type Receipt,
  type VehicleSummary,
} from '@lojistik/shared';
import { api, ApiError } from '../lib/api';
import { toast } from '../lib/toast';
import { formatCount, formatDate, daysSince } from '../lib/format';
import { useVehicles, vehicleOptions } from '../lib/lookups';
import { formatPlate } from '../lib/plate';
import { Icon } from '../components/icons';
import { RegionPlacement, needsRelocation } from '../components/RegionPlacement';
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

/** Bölge süzgeci: '' = hepsi, yoksa bölge id'si ya da aşağıdaki özel anahtarlar. */
const FILTER_PENDING = '__pending';
const FILTER_MOVE = '__move';

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
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [vehicleId, setVehicleId] = useState(''); // boş = araç seçilmedi → yük seçilemez
  const [onlyPlanned, setOnlyPlanned] = useState(false);
  const [quick, setQuick] = useState<QuickTarget | null>(null);
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

  /**
   * Kabulün TAMAMINI seçer/bırakır — müşterinin yükü bölünmüyor, hepsi aynı araca gider.
   * Paletli kabulde tüm kaplar, paletsizde her kalemin DEPODA KALAN miktarı işaretlenir
   * (daha önce kısmi sevk olduysa yalnız kalanı yüklenir).
   */
  const toggleReceipt = (r: Receipt, on: boolean) => {
    const pkgs = (r.packages ?? []).filter((p) => !p.dispatchedAt && !p.dispatchId);
    if (pkgs.length > 0) {
      setPkgSel((sel) => {
        const next = { ...sel };
        pkgs.forEach((p) => (next[p.id] = on));
        return next;
      });
      return;
    }
    setLineQty((sel) => {
      const next = { ...sel };
      for (const l of r.lines ?? []) {
        const remaining = l.remainingQty ?? 0;
        if (remaining > 0) next[l.id] = on ? remaining : 0;
      }
      return next;
    });
  };

  const totalPackages = data?.items.reduce((s, r) => s + (r.packages?.length ?? 0), 0) ?? 0;

  // ---- Araç bağlamı: "bu araca ne yükleyeceğim?" ----
  // Ön ihbardaki `plannedVehicle` zaten hangi yükün hangi araca ait olduğunu söylüyordu;
  // şerit bunu görünür kılar. Araç seçiliyken modal atlanır, yükleme doğrudan o aracın
  // taslak seferine gider ve SAYFADA KALINIR (arka arkaya yük eklenebilsin).
  const { data: vehicles } = useVehicles();
  const { data: drafts } = useQuery({
    queryKey: ['dispatches', { status: 'DRAFT', forPlan: true }],
    queryFn: () => api.get<Paginated<Dispatch>>('/dispatches?page=1&pageSize=50&status=DRAFT'),
  });
  const draftFor = (vid: string) => (drafts?.items ?? []).find((d) => d.vehicle?.id === vid) ?? null;

  /** Araç başına: depoda o araca planlı yük sayısı + açık taslak seferdeki yük sayısı. */
  const vehicleStats = useMemo(() => {
    const planned = new Map<string, number>();
    for (const r of data?.items ?? []) {
      const vid = r.plannedVehicle?.id;
      if (vid) planned.set(vid, (planned.get(vid) ?? 0) + 1);
    }
    return (vehicles ?? [])
      .map((v) => ({
        v,
        planned: planned.get(v.id) ?? 0,
        draft: draftFor(v.id),
      }))
      // Spot araçlar (o iş için tutulan) şeridi doldurmasın: yalnız işi varsa görünür
      .filter((x) => !x.v.isSpot || x.planned > 0 || !!x.draft || x.v.id === vehicleId)
      // İlgili araçlar önce: planlı yükü olan, sonra açık seferi olan, sonra plakaya göre
      .sort(
        (a, b) =>
          b.planned - a.planned ||
          Number(!!b.draft) - Number(!!a.draft) ||
          a.v.plate.localeCompare(b.v.plate, 'tr'),
      );
  }, [vehicles, data, drafts, vehicleId]);

  const activeVehicle = vehicleStats.find((x) => x.v.id === vehicleId) ?? null;

  const loadToVehicleMut = useMutation({
    mutationFn: async () => {
      let id = draftFor(vehicleId)?.id;
      if (!id) {
        const created = await api.post<Dispatch>('/dispatches', {
          destination:
            sel.recipients.length === 1
              ? sel.recipients[0]
              : sel.customers.length > 1
                ? `Karma sefer (${sel.customers.length} müşteri)`
                : 'Sefer',
          vehicleId,
        });
        id = created.id;
      }
      return api.post<Dispatch>(`/dispatches/${id}/items`, { items: entries });
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      clear();
      toast(`${d.reference} planına eklendi`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Yüklenemedi'),
  });

  /** Seçili aracın depodaki tüm planlı yüklerini işaretler. */
  const selectPlanned = () => {
    for (const r of data?.items ?? []) {
      if (r.plannedVehicle?.id === vehicleId) toggleReceipt(r, true);
    }
  };

  // Liste: araç seçiliyken o aracın planlı yükleri ÖNE alınır; istenirse yalnız onlar.
  // ---- Bölge süzgeci: "GEBZE'ye ne gidecek?", "neyi taşımam lazım?" ----
  const [regionFilter, setRegionFilter] = useState('');
  const regionChips = useMemo(() => {
    const items = data?.items ?? [];
    const byId = new Map<string, { id: string; name: string; count: number }>();
    let pending = 0;
    for (const r of items) {
      if (!r.region) pending++;
      else {
        const c = byId.get(r.region.id) ?? { id: r.region.id, name: r.region.name, count: 0 };
        c.count++;
        byId.set(r.region.id, c);
      }
    }
    return {
      regions: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      pending,
      moves: items.filter(needsRelocation).length,
    };
  }, [data]);

  const visible = useMemo(() => {
    let items = data?.items ?? [];
    if (regionFilter === FILTER_PENDING) items = items.filter((r) => !r.regionId);
    else if (regionFilter === FILTER_MOVE) items = items.filter(needsRelocation);
    else if (regionFilter) items = items.filter((r) => r.regionId === regionFilter);
    if (!vehicleId) return items;
    const mine = (r: Receipt) => r.plannedVehicle?.id === vehicleId;
    if (onlyPlanned) return items.filter(mine);
    return [...items].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  }, [data, vehicleId, onlyPlanned, regionFilter]);

  return (
    <div className="space-y-4 pb-28">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Depodakiler</h2>
        <p className="text-sm text-slate-500">
          Kabul edilmiş, henüz sevk edilmemiş ürünler
          {data ? ` · ${data.total} kayıt · ${totalPackages} etiketli paket` : ''}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Önce yukarıdan <b>aracı seçin</b>, sonra farklı müşterilerin ürünlerini işaretleyip o araca
          yükleyin — hepsi tek taşıma irsaliyesinde görünür.
        </p>
      </div>

      {/* Araç şeridi — önce aracı seç, sonra ona yükle. Seçilmezse kartlarda yükleme kutusu çıkmaz. */}
      {vehicleStats.length > 0 && (
        <div className="space-y-2">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            {vehicleStats.map(({ v, planned, draft }) => {
              const on = v.id === vehicleId;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setVehicleId(on ? '' : v.id);
                    setOnlyPlanned(false);
                    // Araç bırakılınca seçim de düşer — araçsız yük seçimi yok
                    if (on) clear();
                  }}
                  className={clsx(
                    'shrink-0 rounded-lg border px-3 py-2 text-left transition',
                    on ? 'border-brand bg-brand/5' : 'border-slate-200 bg-white hover:bg-slate-50',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <Icon name="truck" className="h-3.5 w-3.5" /> {v.plate}
                  </span>
                  <span className="block text-[11px] text-slate-500">
                    {v.driverName || 'Şoför yok'}
                    {planned > 0 ? ` · ${formatCount(planned)} planlı` : ''}
                    {draft ? ` · seferde ${formatCount(draft.items?.length ?? 0)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Seçili araç şeritte zaten vurgulu — plakayı tekrar yazmıyoruz; bu satır yalnız
              araca özel kısayol (planlı yükler / açık sefer) varsa çıkar. */}
          {activeVehicle && (activeVehicle.planned > 0 || activeVehicle.draft) && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand/5 px-3 py-2 text-sm">
              {activeVehicle.planned > 0 && (
                <>
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={onlyPlanned}
                      onChange={(e) => setOnlyPlanned(e.target.checked)}
                    />
                    Yalnız bu araca planlı
                  </label>
                  <button onClick={selectPlanned} className="text-xs font-medium text-brand">
                    Planlı {formatCount(activeVehicle.planned)} yükün hepsini seç
                  </button>
                </>
              )}
              {activeVehicle.draft && (
                <Link
                  to={`/sevkiyat/${activeVehicle.draft.id}`}
                  className="ml-auto text-xs font-medium text-brand"
                >
                  Seferi aç ({activeVehicle.draft.reference}) →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <Input
        type="search"
        placeholder="Ara: müşteri, referans, irsaliye no..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Bölge süzgeci — yalnız depoda mal varken. "Yer değiştir" en başta: bekleyen iş. */}
      {data && data.items.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {[
            ...(regionChips.moves > 0
              ? [{ key: FILTER_MOVE, label: `Yer değiştir (${regionChips.moves})`, warn: true }]
              : []),
            { key: '', label: `Hepsi (${data.items.length})`, warn: false },
            ...regionChips.regions.map((r) => ({
              key: r.id,
              label: `${r.name} (${r.count})`,
              warn: false,
            })),
            ...(regionChips.pending > 0
              ? [
                  {
                    key: FILTER_PENDING,
                    label: `${PENDING_REGION_LABEL} (${regionChips.pending})`,
                    warn: false,
                  },
                ]
              : []),
          ].map((c) => (
            <button
              key={c.key || 'all'}
              onClick={() => setRegionFilter(regionFilter === c.key ? '' : c.key)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition',
                regionFilter === c.key
                  ? c.warn
                    ? 'bg-amber-500 text-white'
                    : 'bg-brand text-white'
                  : c.warn
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Depo boş görünüyor" hint="Tamamlanan mal kabuller burada listelenir." />
      ) : visible.length === 0 ? (
        // Süzgeç hiçbir şey bırakmadıysa: çıkış yolunu göster
        regionFilter ? (
          <EmptyState title="Bu süzgeçte yük yok" hint="Bölge süzgecini kaldırın." />
        ) : (
          <EmptyState
            title="Bu araca planlı yük yok"
            hint="Süzgeci kaldırın ya da depodaki başka yükleri seçip bu araca yükleyin."
          />
        )
      ) : (
        // Masaüstünde çift sütun (kartlar kısa, tam genişlikte sağ taraf boş kalıyordu); mobilde tek.
        // Satırdaki kartlar eşit boyda uzar → ızgara düzgün görünür.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((r) => {
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
              <Card key={r.id} className={clsx('flex flex-col gap-2', picked && 'ring-2 ring-brand/40')}>
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
                    Giriş: {formatDate(r.completedAt)}
                    {r.deliveryBy ? ` · Son teslim: ${formatDate(r.deliveryBy)}` : ''}
                  </p>
                </Link>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  {r.plannedVehicle ? (
                    <Badge className="bg-indigo-100 text-indigo-700">
                      <Icon name="truck" className="h-3.5 w-3.5" /> {r.plannedVehicle.plate}
                      {r.plannedVehicle.trailerPlate ? ` / ${r.plannedVehicle.trailerPlate}` : ''}
                    </Badge>
                  ) : (
                    <Badge className="inline-flex items-center gap-1 bg-slate-100 text-slate-500">
                      <Icon name="truck" className="h-3.5 w-3.5" /> Araç belirsiz
                    </Badge>
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

                {/* Depoda nerede / nereye — bölge sonradan girilirse "yer değiştir" burada çıkar */}
                <RegionPlacement receipt={r} compact />

                {/* Yük planı seçimi — KABUL BAZINDA, tek onay kutusu.
                    Bir müşterinin yükü BÖLÜNMÜYOR: tamamı aynı araca gider. Eskiden
                    paletsizde `− miktar +` sayacı, paletlide palet palet checkbox vardı;
                    ikisi de gereksiz karar noktasıydı ve operatörü yavaşlatıyordu.
                    Alttaki `entries`/API yapısı aynı — seçim tüm kapları/kalemleri işaretler. */}
                {/* Önce ARAÇ seçilir (üstteki şerit), sonra ona yük: araçsız seçim gösterilmez */}
                {canDispatch && activeVehicle && (
                  <label
                    className={clsx(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-2',
                      picked ? 'border-brand bg-brand/5' : 'border-slate-200 bg-slate-50',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={(e) => toggleReceipt(r, e.target.checked)}
                      />
                      Bu kabulü {activeVehicle.v.plate} aracına yükle
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {picked ? 'Seçildi' : 'Tamamı'}
                    </span>
                  </label>
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
                    // mt-auto: ızgarada yan kart uzunsa buton kartın DİBİNE otursun, hizalı dursun
                    className="mt-auto w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                  >
                    Sevk Et
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Yük planı çubuğu — seçim yapılınca altta sabitlenir.
          Alt dolgu ARBITRARY değer: `.safe-bottom` sınıfı `@tailwind utilities`'ten sonra
          tanımlı olduğu için `p-3`'ün padding-bottom'unu eziyordu ve masaüstünde
          env(safe-area-inset-bottom)=0px → düğme ekranın en altına yapışıyordu.
          Burada tek bildirimde hem taban boşluk hem telefon güvenli alanı veriliyor. */}
      {entries.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.25)] backdrop-blur lg:pl-64">
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
              {/* Seçim yalnız araç seçiliyken yapılabildiği için araç hep belli: doğrudan o
                  aracın seferine ekle ve sayfada kal (arka arkaya yük eklenebilsin). */}
              {activeVehicle && (
                <Button
                  loading={loadToVehicleMut.isPending}
                  onClick={() => loadToVehicleMut.mutate()}
                >
                  <Icon name="truck" className="h-4 w-4" /> {activeVehicle.v.plate} aracına yükle
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {quick && <QuickDispatchModal target={quick} onClose={() => setQuick(null)} />}
    </div>
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
          ? `${target.count} palet sevk edildi · ${d.reference}`
          : `Sevk edildi · ${d.reference}`,
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
            options={vehicleOptions(vehicles)}
            formatQuery={formatPlate}
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
            <Icon name="truck" className="h-4 w-4" /> Sevk Et{target.hasPackages ? ` (${target.count})` : ''}
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
  return (
    <Badge className={clsx(cls, 'inline-flex items-center gap-1')}>
      <Icon name="calendar" className="h-3.5 w-3.5" /> {text}
    </Badge>
  );
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
