import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { formatDate, daysSince } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import { Card } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import type { Paginated, Customer, Warehouse, Asn, Receipt, Dispatch, Vehicle } from '@lojistik/shared';

/**
 * Panel = "bugün ne yapmalıyım?" ekranı.
 *
 * Eskiden 5 sayaç vardı (müşteri/depo/araç dâhil) — doğru ama işe götürmüyordu: kaç müşteri
 * olduğu günlük operasyonda bir karar değiştirmiyor. Artık üstte AÇIK İŞLER (tıklanınca o
 * ekrana götürür), altta TESLİM SIRASI (termini en yakın yükler) var. Kurulum sayıları
 * (müşteri/depo/araç) en altta tek satırlık sessiz bir şeride indi.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  // Açık işler — hepsi toplam sayı için pageSize=1 (liste gövdesi gereksiz)
  const expectedAsn = useQuery({
    queryKey: ['asn', { status: 'EXPECTED', dashboard: true }],
    queryFn: () => api.get<Paginated<Asn>>('/asn?status=EXPECTED&page=1&pageSize=1'),
  });
  const openReceipts = useQuery({
    queryKey: ['receipts', { status: 'IN_PROGRESS', dashboard: true }],
    queryFn: () => api.get<Paginated<Receipt>>('/receipts?status=IN_PROGRESS&page=1&pageSize=1'),
  });
  const draftDispatches = useQuery({
    queryKey: ['dispatches', { status: 'DRAFT', dashboard: true }],
    queryFn: () => api.get<Paginated<Dispatch>>('/dispatches?status=DRAFT&page=1&pageSize=1'),
  });
  // Depo: hem sayı hem "teslim sırası" listesi — findStock zaten termine göre sıralı
  // (terminsizler sonda), yani ilk kayıtlar en acil olanlar.
  const stock = useQuery({
    queryKey: ['stock', { dashboard: true }],
    queryFn: () => api.get<Paginated<Receipt>>('/receipts/stock?page=1&pageSize=5'),
  });

  // Kurulum verisi — günlük iş değil, alt şeritte
  const customers = useQuery({
    queryKey: ['customers', { page: 1 }],
    queryFn: () => api.get<Paginated<Customer>>('/customers?page=1&pageSize=1'),
  });
  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/warehouses'),
  });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
  });

  const urgent = stock.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Merhaba, {user?.fullName}</h2>
        <p className="text-sm text-slate-500">Bugün bekleyen işler</p>
      </div>

      {/* AÇIK İŞLER — akış sırasına göre: ön ihbar → mal kabul → depo → sevkiyat */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TaskCard
          label="Bekleyen ön ihbar"
          hint="Mal kabul edilecek"
          value={expectedAsn.data?.total}
          to="/on-ihbar"
          icon="clipboard"
          tint="bg-blue-50 text-blue-600"
        />
        <TaskCard
          label="Devam eden mal kabul"
          hint="Sayım sürüyor"
          value={openReceipts.data?.total}
          to="/mal-kabul"
          icon="inbox"
          tint="bg-orange-50 text-orange-600"
        />
        <TaskCard
          label="Depoda bekleyen"
          hint="Sevk edilmeyi bekliyor"
          value={stock.data?.total}
          to="/depo"
          icon="boxes"
          tint="bg-violet-50 text-violet-600"
        />
        <TaskCard
          label="Hazırlanan sevkiyat"
          hint="Yüklemesi tamamlanmadı"
          value={draftDispatches.data?.total}
          to="/sevkiyat"
          icon="truck"
          tint="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* TESLİM SIRASI — termini en yakın yükler; gecikmişler kırmızı */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500">Teslim sırası</h3>
          <Link to="/depo" className="text-xs font-medium text-brand hover:underline">
            Depoya git
          </Link>
        </div>
        {stock.isLoading ? (
          <Card className="text-sm text-slate-400">Yükleniyor…</Card>
        ) : urgent.length === 0 ? (
          <Card className="text-sm text-slate-500">Depoda sevk bekleyen yük yok.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {urgent.map((r) => (
              <Link key={r.id} to={`/mal-kabul/${r.id}`} className="block">
                <Card className="flex items-center gap-3 py-3 transition hover:shadow-md">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {r.customer?.name}
                      {r.recipientCustomer?.name && (
                        <>
                          <span className="mx-1.5 font-normal text-slate-400">&rarr;</span>
                          <span className="font-medium text-slate-600">
                            {r.recipientCustomer.name}
                          </span>
                        </>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {r.reference} · {daysSince(r.completedAt)} gündür depoda
                    </p>
                  </div>
                  <DueTag date={r.deliveryBy} />
                  <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-300" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* HIZLI İŞLEM */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuickAction
          to="/mal-kabul/baslat"
          icon="inbox"
          title="Mal Kabul Başlat"
          hint="Ön ihbardan ya da kör kabul"
        />
        <QuickAction
          to="/on-ihbar/yeni"
          icon="clipboard"
          title="Yeni Ön İhbar"
          hint="Gelecek yükü kaydet"
        />
      </div>

      {/* KURULUM — günlük iş değil, sessiz şerit */}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <Link to="/musteriler" className="hover:text-brand hover:underline">
          {customers.data?.total ?? '–'} müşteri
        </Link>
        <Link to="/depolar" className="hover:text-brand hover:underline">
          {warehouses.data?.length ?? '–'} depo
        </Link>
        <Link to="/araclar" className="hover:text-brand hover:underline">
          {vehicles.data?.length ?? '–'} araç
        </Link>
      </p>
    </div>
  );
}

/** Açık iş sayacı — sayı 0 ise soluk (yapılacak bir şey yok demektir). */
function TaskCard({
  label,
  hint,
  value,
  to,
  icon,
  tint,
}: {
  label: string;
  hint: string;
  value?: number;
  to: string;
  icon: IconName;
  tint: string;
}) {
  const empty = value === 0;
  return (
    <Link to={to} className="block">
      <Card
        className={clsx(
          'h-full transition hover:-translate-y-0.5 hover:shadow-md',
          empty && 'opacity-60',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
              empty ? 'bg-slate-100 text-slate-400' : tint,
            )}
          >
            <Icon name={icon} className="h-5 w-5" />
          </span>
          <p className="text-2xl font-bold leading-none text-slate-900">{value ?? '–'}</p>
        </div>
        <p className="mt-2 text-sm font-medium text-slate-800">{label}</p>
        <p className="truncate text-xs text-slate-400">{hint}</p>
      </Card>
    </Link>
  );
}

/** Termin rozeti — Depo ekranındaki DueBadge ile aynı eşikler. */
function DueTag({ date }: { date?: string | null }) {
  if (!date) return <span className="shrink-0 text-xs text-slate-300">termin yok</span>;
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  const cls =
    days < 0
      ? 'bg-red-100 text-red-700'
      : days <= 1
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-600';
  const text =
    days < 0 ? `${Math.abs(days)} gün gecikti` : days === 0 ? 'Bugün' : `${days} gün kaldı`;
  return (
    <span
      className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', cls)}
      title={`Son teslim: ${formatDate(date)}`}
    >
      {text}
    </span>
  );
}

function QuickAction({
  to,
  icon,
  title,
  hint,
}: {
  to: string;
  icon: IconName;
  title: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-4 rounded-md bg-gradient-to-br from-brand to-brand-dark px-5 py-4 text-white shadow-sm shadow-brand/30 transition hover:shadow-md hover:shadow-brand/40"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="truncate text-sm text-white/80">{hint}</p>
      </div>
      <Icon name="chevron" className="ml-auto h-5 w-5 shrink-0 text-white/70" />
    </Link>
  );
}
