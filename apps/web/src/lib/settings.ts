import { UserRole } from '@lojistik/shared';
import type { IconName } from '../components/icons';

/**
 * AYARLAR KÜTÜĞÜ — tek kaynak.
 *
 * Her yeni ayar modülünü sol menüye satır olarak eklemek ölçeklenmiyordu (yarın tema
 * rengi, bildirim, yedekleme… hepsi menüye binerdi). Seyrek kullanılan, "bir kez kur
 * unut" nitelikli modüller buraya kaydedilir; sol menüde yalnız tek bir "Ayarlar"
 * girişi durur.
 *
 * Yeni ayar eklemek = buraya BİR satır + App.tsx'e rotası. Menüye dokunmak gerekmez.
 * `roles` boşsa herkes görür; doluysa yalnız o roller.
 */
export type SettingsItem = {
  to: string;
  label: string;
  description: string;
  icon: IconName;
  roles?: UserRole[];
};

export const SETTINGS_GROUPS: { title: string; items: SettingsItem[] }[] = [
  {
    title: 'Belgeler',
    items: [
      {
        to: '/irsaliye-serisi',
        label: 'İrsaliye Serisi',
        description: 'Matbu taşıma irsaliyesinin seri harfi ve sıradaki numarası',
        icon: 'clipboard',
        roles: [UserRole.ADMIN, UserRole.SUPERVISOR],
      },
    ],
  },
  {
    title: 'Hesap',
    items: [
      {
        to: '/kullanicilar',
        label: 'Kullanıcılar',
        description: 'Kullanıcı ekle, rol ver, pasife al',
        icon: 'users',
        roles: [UserRole.ADMIN],
      },
      {
        to: '/sifre-degistir',
        label: 'Şifre Değiştir',
        description: 'Kendi giriş şifrenizi güncelleyin',
        icon: 'key',
      },
    ],
  },
];

/** Rolüne göre görebileceği ayarlar (boş grup elenir). */
export function settingsFor(role?: UserRole) {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || (role && i.roles.includes(role))),
  })).filter((g) => g.items.length > 0);
}

/** Sayfa başlığı çözümlemesi için düz liste (AppLayout kullanır). */
export const SETTINGS_ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items);
