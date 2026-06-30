import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuthStore } from '../stores/auth';
import { UserRole } from '@lojistik/shared';
import { Toaster } from './Toaster';
import { Icon, type IconName } from './icons';

type NavItem = { to: string; label: string; icon: IconName; roles?: UserRole[] };

const PRIMARY: NavItem[] = [
  { to: '/', label: 'Özet', icon: 'home' },
  { to: '/on-ihbar', label: 'Ön İhbar', icon: 'clipboard' },
  { to: '/mal-kabul', label: 'Mal Kabul', icon: 'inbox' },
  { to: '/depo', label: 'Depo', icon: 'boxes' },
  { to: '/sevkiyat', label: 'Sevkiyat', icon: 'truck' },
];

const GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: PRIMARY },
  {
    title: 'Tanımlar',
    items: [
      { to: '/musteriler', label: 'Müşteriler', icon: 'building' },
      { to: '/depolar', label: 'Depolar', icon: 'warehouse' },
      { to: '/araclar', label: 'Araçlar', icon: 'van' },
    ],
  },
  {
    title: 'Hesap',
    items: [
      { to: '/kullanicilar', label: 'Kullanıcılar', icon: 'users', roles: [UserRole.ADMIN] },
      { to: '/sifre-degistir', label: 'Şifre Değiştir', icon: 'key' },
    ],
  },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items);

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Yönetici',
  SUPERVISOR: 'Şef',
  OPERATOR: 'Operatör',
};

function titleFor(path: string): string {
  if (path === '/') return 'Özet';
  const match = ALL_ITEMS.filter((i) => i.to !== '/' && path.startsWith(i.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  return match?.label ?? 'Tesellüm & Depo';
}

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppLayout() {
  const { user } = useAuthStore();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || (user && i.roles.includes(user.role))),
  })).filter((g) => g.items.length > 0);

  const title = titleFor(location.pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster />

      {/* Masaüstü sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        <SidebarContent groups={groups} />
      </aside>

      {/* Mobil çekmece arka planı */}
      <div
        className={clsx(
          'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setDrawerOpen(false)}
      />
      {/* Mobil çekmece */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-72 transform bg-white shadow-2xl transition-transform duration-200 ease-out lg:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <SidebarContent groups={groups} onNavigate={() => setDrawerOpen(false)} />
      </aside>

      {/* İçerik kolonu */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Menü"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>
          <h1 className="text-base font-semibold text-slate-900 lg:text-lg">{title}</h1>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 lg:px-8 lg:py-8 lg:pb-10">
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>

        {/* Mobil alt tab bar */}
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition',
                  isActive ? 'text-brand' : 'text-slate-400',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'flex h-8 w-12 items-center justify-center rounded-full transition',
                      isActive && 'bg-brand/10',
                    )}
                  >
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function SidebarContent({
  groups,
  onNavigate,
}: {
  groups: { title?: string; items: NavItem[] }[];
  onNavigate?: () => void;
}) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Marka */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-sm">
          <Icon name="warehouse" className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-900">Tesellüm &amp; Depo</p>
          <p className="text-xs text-slate-400">Depo Yönetimi</p>
        </div>
      </div>

      {/* Menü */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {groups.map((group, i) => (
          <div key={i} className="space-y-1">
            {group.title && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.title}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand/10 text-brand'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )
                }
              >
                <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Kullanıcı */}
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
            {initials(user?.fullName)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{user?.fullName}</p>
            <p className="truncate text-xs text-slate-400">
              {user?.role ? (ROLE_LABEL[user.role] ?? user.role) : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Çıkış"
            aria-label="Çıkış"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
