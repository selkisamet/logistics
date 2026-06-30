# Lojistik — Tesellüm & Depo Yönetim Sistemi (WMS)

3PL (üçüncü parti lojistik) firması için mal kabul (tesellüm), depolama ve dağıtım uygulaması.
Mobil-öncelikli **PWA** + **NestJS API** + **PostgreSQL**, temiz ve modüler monorepo yapısı.

## Yapı

```
apps/
  web/     React PWA (Vite + TS + Tailwind) — telefonla QR okutma, offline
  api/     NestJS REST API (Prisma + PostgreSQL, JWT auth)
packages/
  shared/  Ortak zod şemaları + tipler (front + back tek kaynak)
```

## Gereksinimler

- Node.js >= 20, pnpm >= 9
- PostgreSQL — bu makinede yönetici gerektirmeyen **taşınabilir Postgres** `.tools/` altına kuruldu.
  - Başlat: `pnpm pg:start` · Durdur: `pnpm pg:stop` (Windows servisi değildir; her oturumda başlatın)
  - Alternatif: Docker (`docker compose up -d`) ya da yerel Postgres kurulumu.

## Kurulum

```bash
pnpm install
```

### Veritabanı

`apps/api/.env` dosyasını oluşturun (kök `.env.example` örnek alınabilir):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lojistik?schema=public"
JWT_SECRET="uzun-rastgele-bir-deger"
WEB_ORIGIN="http://localhost:5173"
```

`apps/web/.env` (opsiyonel; varsayılan zaten localhost:3000):

```env
VITE_API_URL="http://localhost:3000"
```

Şema migrasyonu + örnek veri:

```bash
pnpm --filter @lojistik/api prisma migrate dev --name init
pnpm --filter @lojistik/api db:seed
```

## Çalıştırma

```bash
pnpm dev      # web (http://localhost:5173) + api (http://localhost:3000/api) birlikte
```

### Demo hesaplar (seed sonrası)

- Admin: `admin@lojistik.local` / `admin123`
- Operatör: `operator@lojistik.local` / `operator123`

## Yedekleme

- **Otomatik:** Her gün 13:00'te Windows zamanlanmış görevi (`LojistikYedek`) veritabanını + yüklenen fotoğrafları `backups/` altına yedekler (bilgisayar o saatte kapalıysa açılınca çalışır). 30 günden eski yedekler otomatik silinir.
- **Elle yedek:** `YEDEKLE.bat`'a çift tıkla.
- **Geri yükleme:** `GERI_YUKLE.bat` → yedeği seç → `EVET` yaz. ⚠️ Mevcut veriyi değiştirir; önce uygulamayı (BASLAT penceresini) kapatın.
- Yedekler `backups/lojistik_<tarih>.dump` (veritabanı) ve `backups/uploads_<tarih>.zip` (fotoğraflar).
- **Öneri:** `backups/` klasörünü ara sıra harici diske / buluta kopyalayın (aynı bilgisayar bozulursa yedek de gitmesin).

## Yol haritası (fazlar)

- **Faz 0–1 (tamam):** Monorepo, auth, müşteri & depo yönetimi, mobil layout.
- **Faz 2:** ASN / Ön İhbar.
- **Faz 3:** Tesellüm akışı — QR okutma, sayım, QR etiket, offline kuyruk.
- **Faz 4:** Fark & hasar tutanağı + foto.
- **Faz 5 (tamam):** AI etiket OCR — mal kabul sayım ekranında "🤖 Etiketi Oku (AI)".

### AI etiket OCR'ı aktifleştirme (Faz 5)

`apps/api/.env` içine bir Anthropic API anahtarı ekleyin, sonra API'yi yeniden başlatın:

```env
OCR_PROVIDER="claude"
ANTHROPIC_API_KEY="sk-ant-..."
```

Anahtar yoksa endpoint güvenli şekilde 503 döner ve özellik gizli kalır (uygulama çalışmaya devam eder).
Kullanılan model: `claude-opus-4-8` (vision + yapısal çıktı).
