import { Link } from 'react-router-dom';
import { Card, EmptyState } from '../components/ui';
import { Icon } from '../components/icons';
import { settingsFor } from '../lib/settings';
import { useAuthStore } from '../stores/auth';

/**
 * Ayarlar — seyrek kullanılan "bir kez kur unut" modüllerinin toplandığı yer.
 * İçerik [lib/settings.ts](../lib/settings.ts) kütüğünden gelir; yeni ayar eklemek
 * için buraya değil oraya bir satır yazılır.
 */
export function SettingsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const groups = settingsFor(role);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Ayarlar</h2>
        <p className="text-sm text-slate-500">Uygulama ve hesap tanımları</p>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Ayar yok" hint="Rolünüzün erişebileceği bir ayar bulunmuyor." />
      ) : (
        groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-2 text-sm font-semibold text-slate-500">{g.title}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {g.items.map((item) => (
                <Link key={item.to} to={item.to} className="block">
                  <Card className="flex h-full items-center gap-3 transition hover:-translate-y-0.5 hover:shadow-md">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon name={item.icon} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                    <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-300" />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
