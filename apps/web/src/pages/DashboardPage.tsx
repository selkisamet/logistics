import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Card } from '../components/ui';
import { Icon, type IconName } from '../components/icons';
import type { Paginated, Customer, Warehouse, Asn, Receipt, Vehicle } from '@lojistik/shared';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const customers = useQuery({
    queryKey: ['customers', { page: 1 }],
    queryFn: () => api.get<Paginated<Customer>>('/customers?page=1&pageSize=1'),
  });
  const warehouses = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => api.get<Warehouse[]>('/warehouses'),
  });
  const expectedAsn = useQuery({
    queryKey: ['asn', { status: 'EXPECTED', dashboard: true }],
    queryFn: () => api.get<Paginated<Asn>>('/asn?status=EXPECTED&page=1&pageSize=1'),
  });
  const stock = useQuery({
    queryKey: ['stock', { dashboard: true }],
    queryFn: () => api.get<Paginated<Receipt>>('/receipts/stock?page=1&pageSize=1'),
  });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get<Vehicle[]>('/vehicles'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Merhaba, {user?.fullName} 👋</h2>
        <p className="text-sm text-slate-500">Günlük operasyon özeti</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Beklenen Ön İhbar"
          value={expectedAsn.data?.total ?? '–'}
          to="/on-ihbar"
          icon="clipboard"
          tint="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Depodaki"
          value={stock.data?.total ?? '–'}
          to="/depo"
          icon="boxes"
          tint="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Müşteri"
          value={customers.data?.total ?? '–'}
          to="/musteriler"
          icon="building"
          tint="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Depo Tesisi"
          value={warehouses.data?.length ?? '–'}
          to="/depolar"
          icon="warehouse"
          tint="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Araçlar"
          value={vehicles.data?.length ?? '–'}
          to="/araclar"
          icon="van"
          tint="bg-sky-50 text-sky-600"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500">Hızlı İşlem</h3>
        <Link
          to="/mal-kabul"
          className="flex items-center gap-4 rounded-md bg-gradient-to-br from-brand to-brand-dark px-5 py-4 text-white shadow-sm shadow-brand/30 transition hover:shadow-md hover:shadow-brand/40"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
            <Icon name="inbox" className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold">Yeni Mal Kabul Başlat</p>
            <p className="text-sm text-white/80">QR okutarak tesellüm</p>
          </div>
          <Icon name="chevron" className="ml-auto h-5 w-5 text-white/70" />
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  to,
  icon,
  tint,
}: {
  label: string;
  value: number | string;
  to: string;
  icon: IconName;
  tint: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-3 transition hover:-translate-y-0.5 hover:shadow-md">
        <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tint)}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight text-slate-900">{value}</p>
          <p className="truncate text-xs text-slate-500">{label}</p>
        </div>
      </Card>
    </Link>
  );
}
