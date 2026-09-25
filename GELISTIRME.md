# Yeni bilgisayarda geliştirme ortamı

Sıfırdan bir makinede (Windows/macOS/Linux) projeyi çalıştırmak için. Sunucu kurulumu için bkz. [KURULUM.md](KURULUM.md).

## 1. Araçlar

- **Git**
- **Node.js 20 LTS** (kurulumda "PATH'e ekle" işaretli)
- **pnpm 9**: `npm i -g pnpm@9`
- **Docker Desktop** (Postgres için en kolay yol) — ya da normal PostgreSQL 16 kurulumu
- **VS Code** + Claude Code eklentisi

## 2. Kod

```bash
git clone https://github.com/selkisamet/logistics.git
cd logistics
pnpm install
```

## 3. Veritabanı

Docker ile (repodaki `docker-compose.yml`):

```bash
docker compose up -d
```

Bağlantı: `postgresql://postgres:postgres@localhost:5432/lojistik?schema=public`.
Normal PostgreSQL kurduysan `lojistik` adında bir veritabanı oluştur, kullanıcı/şifreyi `.env`'e yaz.

> Firma PC'sindeki `.tools/` (taşınabilir Postgres), `BASLAT.bat`, `pg:start`/`pg:stop` yalnız o makineye özgüdür; burada gerekmez.

## 4. Ortam dosyaları (git'e girmez)

`apps/api/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lojistik?schema=public"
JWT_SECRET="uzun-rastgele-bir-deger"
JWT_EXPIRES_IN="1d"
API_PORT=3000
WEB_ORIGIN="http://localhost:5173"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./uploads"
OCR_PROVIDER="claude"
ANTHROPIC_API_KEY=""   # irsaliye no OCR'ı için; boşsa yalnız OCR çalışmaz
```

`apps/web/.env`:

```env
VITE_API_URL=""
```

## 5. Derle, şemayı kur, örnek veri

```bash
pnpm shared:build
cd apps/api
pnpm prisma migrate deploy
pnpm prisma generate
pnpm db:seed
cd ../..
```

## 6. Çalıştır

```bash
pnpm dev
```

Web: http://localhost:5173 — API: http://localhost:3000/api. Giriş bilgileri `apps/api/prisma/seed.ts`'te.

## Kontrol

```bash
cd apps/web && npx tsc --noEmit
cd ../api && npx tsc --noEmit
```

`apps/web` veya `packages/shared`'a push edince GitHub Actions APK üretir (Actions → Artifacts).

## Claude Code

Sohbet geçmişi makineye bağlıdır, taşınmaz. Bağlam `CLAUDE.md` (otomatik yüklenir) ve
[docs/claude-notlar.md](docs/claude-notlar.md) içindedir. İlk oturumda:
"CLAUDE.md ve docs/claude-notlar.md'yi oku" demek yeterli.
