# Kendi Bilgisayarımda Kurulum — Adım Adım

Bu rehber üç işi sırayla anlatır:

1. **Kendi bilgisayarında geliştirme ortamı** — uygulamayı yerelde çalıştırmak (Bölüm 1–7)
2. **VPS kurulumu** — kendi bilgisayarından sunucuya bağlanıp uygulamayı yayına almak (Bölüm 8–13)
3. **Günlük iş akışı** — değişiklik yap → GitHub'a gönder → sunucuda yayına al (Bölüm 14)

Komutlar Windows (PowerShell) için yazıldı. macOS/Linux'ta aynı komutlar Terminal'de çalışır.

> **Neden VPS?** Uygulama şimdiye kadar firma PC'sinde çalışıyordu (`BASLAT.bat`, taşınabilir
> Postgres, cloudflared tüneli). O PC'ye artık erişimin olmayacak. VPS'e taşınınca uygulama 7/24
> `https://lojistik.enderlojistik.com` adresinde çalışır. Sen de güncellemeleri kendi
> bilgisayarından uzaktan yaparsın.

---

## BÖLÜM A — Kendi bilgisayarında geliştirme ortamı

### 1. Programları kur

| Program | Nereden | Not |
|---|---|---|
| **Git** | https://git-scm.com | Kurulumda varsayılanlar yeterli |
| **Node.js 20 LTS** | https://nodejs.org | "Add to PATH" işaretli olsun |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop | Veritabanı için. WSL 2 isterse kabul et, bilgisayarı yeniden başlat |
| **VS Code** | https://code.visualstudio.com | + **Claude Code** eklentisi |

Kurulumdan sonra **yeni** bir PowerShell aç ve kontrol et:

```powershell
git --version
node --version      # v20.x olmalı
docker --version
```

pnpm'i kur:

```powershell
npm install -g pnpm@9
pnpm --version      # 9.x
```

Git'e kendini tanıt (bir kez):

```powershell
git config --global user.name "Samet Selki"
git config --global user.email "sametselki@outlook.com"
```

### 2. Projeyi indir

```powershell
cd $HOME\Desktop
git clone https://github.com/selkisamet/logistics.git
cd logistics
pnpm install
```

> GitHub giriş isterse tarayıcıdan onayla (Git Credential Manager açılır).

### 3. Veritabanını başlat (Docker)

Docker Desktop'ın açık olduğundan emin ol, sonra proje klasöründe:

```powershell
docker compose up -d
```

Bu komut repodaki `docker-compose.yml` ile Postgres 16'yı başlatır:
kullanıcı `postgres`, şifre `postgres`, veritabanı `lojistik`, port `5432`.
Docker Desktop açık olduğu sürece bilgisayar yeniden başlasa da kendiliğinden ayağa kalkar.

> Docker istemiyorsan: https://www.postgresql.org/download/windows/ ile PostgreSQL 16 kur,
> kurulumda `postgres` kullanıcısına şifre ver, pgAdmin'den `lojistik` veritabanını oluştur.
> Aşağıdaki `DATABASE_URL`'de şifreyi ona göre değiştir.

### 4. Ortam dosyalarını oluştur (git'e GİRMEZ)

**`apps/api/.env`** dosyasını oluştur:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lojistik?schema=public"
JWT_SECRET="yerel-gelistirme-icin-uzun-rastgele-bir-deger"
JWT_EXPIRES_IN="1d"
API_PORT=3000
WEB_ORIGIN="http://localhost:5173"
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./uploads"
OCR_PROVIDER="claude"
ANTHROPIC_API_KEY=""
```

**`apps/web/.env`** dosyasını oluştur:

```env
VITE_API_URL=""
```

> `ANTHROPIC_API_KEY` yalnız irsaliye-no OCR düğmesi için gerekir. Boş kalırsa sadece o düğme
> hata verir. Kendi anahtarını https://console.anthropic.com adresinden alabilirsin.
> **Firma PC'sindeki eski anahtarı kullanma.**

### 5. Derle ve veritabanı şemasını kur

```powershell
pnpm shared:build
cd apps\api
pnpm prisma migrate deploy
pnpm prisma generate
pnpm db:seed
cd ..\..
```

- `shared:build` — ortak şemaları derler. `packages/shared`'ı her değiştirdiğinde tekrar çalıştır.
- `migrate deploy` — tabloları oluşturur.
- `db:seed` — giriş hesaplarını ekler: `admin@lojistik.local` / `admin123`,
  `operator@lojistik.local` / `operator123`.

### 6. Çalıştır

```powershell
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/health → `ok` benzeri bir yanıt dönmeli

`admin@lojistik.local` / `admin123` ile giriş yap. Yerel veritabanı boş başlar: müşteri, depo ve
araçları deneme için elle eklersin. **Gerçek müşteri verisini kendi bilgisayarına alma.**
Gerçek veri yalnız VPS'te durur.

Durdurmak için terminalde `Ctrl+C`.

### 7. Claude Code ile devam

VS Code'da proje klasörünü aç, Claude Code'u başlat ve ilk mesajda şunu yaz:

> CLAUDE.md ve docs/claude-notlar.md'yi oku. Yeni bilgisayardayım, ortamı GELISTIRME.md'ye göre kurdum.

Firma PC'sindeki sohbet geçmişi buraya gelmez. Proje bağlamı `CLAUDE.md`'de (otomatik yüklenir),
çalışma tercihlerin ise `docs/claude-notlar.md`'de.

> `CLAUDE.md`'deki "Çalıştırma" bölümü (`BASLAT.bat`, `.tools/`, `TUNEL.bat`) firma PC'sine
> özgüdür. Kendi bilgisayarında `docker compose up -d` + `pnpm dev` yeterli.

---

## BÖLÜM B — VPS kurulumu (kendi bilgisayarından)

Sunucu: TR-VPS-3 (2 CPU / 2 GB RAM / 40 GB SSD, **Ubuntu 24.04 LTS**).
Sunucuda Postgres, uygulama ve Caddy (otomatik HTTPS) Docker içinde çalışır.
Bu kurulum bir kez yapılır.

**Başlamadan elinde olması gerekenler:**
- VPS'in **IP adresi** ve **root şifresi** (sağlayıcının panelinden ya da e-postasından)
- `enderlojistik.com` alan adı paneline erişim
- Anthropic API anahtarı (opsiyonel, OCR için)

### 8. Kendi bilgisayarından sunucuya SSH anahtarıyla bağlan

Windows 10/11'de `ssh` hazır gelir. Önce kendi bilgisayarında bir anahtar üret:

```powershell
ssh-keygen -t ed25519 -C "sametselki@outlook.com"
# Enter, Enter (istersen parola ver)
```

Açık anahtarı sunucuya kopyala. İlk seferde root şifresi sorulur:

```powershell
type $HOME\.ssh\id_ed25519.pub | ssh root@SUNUCU_IP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Test et. Artık şifre sormamalı:

```powershell
ssh root@SUNUCU_IP
```

> Kolaylık için `$HOME\.ssh\config` dosyasına şunu ekle, sonra sadece `ssh lojistik` yazarsın:
> ```
> Host lojistik
>     HostName SUNUCU_IP
>     User root
> ```

### 9. DNS kaydı (sunucu kurulumundan ÖNCE)

Alan adı panelinde (`enderlojistik.com`) şu kaydı ekle:

| Tip | Ad | Değer |
|---|---|---|
| A | `lojistik` | *VPS'in IP adresi* |

Kendi bilgisayarında kontrol et. IP adresi dönene kadar bekle (genelde birkaç dakika):

```powershell
nslookup lojistik.enderlojistik.com
```

> Alan adı Cloudflare'deyse turuncu bulutu (proxy) **kapat**, gri olsun. Açık kalırsa HTTPS
> sertifikası alınamaz.

### 10. Sunucuyu hazırla

`ssh lojistik` ile bağlan. Bu bölümdeki komutlar **sunucuda** çalışır:

```bash
# Sistemi güncelle
apt update && apt upgrade -y

# Docker'ı kur
curl -fsSL https://get.docker.com | sh

# Güvenlik duvarı: yalnız SSH ve web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Saat dilimi
timedatectl set-timezone Europe/Istanbul

# 2 GB swap (2 GB RAM'de derleme sırasında bellek yetmeyebilir)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 11. Projeyi sunucuya indir ve ayarla

Hâlâ sunucudasın:

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/selkisamet/logistics.git lojistik
cd lojistik

cp .env.prod.example .env

# Güçlü parolalar üret. Çıktıları bir kenara kopyala
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -base64 48   # → JWT_SECRET

nano .env
```

`.env` dolu hali şöyle görünmeli:

```
DOMAIN=lojistik.enderlojistik.com
POSTGRES_PASSWORD=<üretilen>
JWT_SECRET=<üretilen>
ANTHROPIC_API_KEY=<anahtarın ya da boş>
```

`nano`'da kaydetmek için `Ctrl+O`, `Enter`; çıkmak için `Ctrl+X`.

> Bu `.env` yalnız sunucuda durur. Parolaları bir şifre yöneticisine de kaydet.
> `JWT_SECRET`'ı sonradan değiştirirsen herkesin oturumu kapanır.

### 12. Başlat

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

İlk derleme 5–10 dakika sürer. İlerlemeyi izle:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Şu satırları görünce hazırdır (`Ctrl+C` ile izlemeden çık; uygulama çalışmaya devam eder):

```
==> Veritabanı şeması uygulanıyor (prisma migrate deploy)
==> Giriş hesapları kontrol ediliyor (seed)
==> Uygulama başlıyor
```

Kendi bilgisayarının tarayıcısından **https://lojistik.enderlojistik.com** adresini aç.
`admin@lojistik.local` / `admin123` ile gir ve **iki hesabın şifresini hemen değiştir**
(admin ve `operator@lojistik.local`).

#### (Varsa) mevcut veriyi taşı

Firmanın mevcut kayıtları başka bir yerde duruyorsa (firma PC'si ya da eski Render/Supabase)
ve VPS'e taşınacaksa:

1. Kaynaktan bir `pg_dump` yedeği al. Firma PC'sinde bunu `YEDEKLE.bat` yapar →
   `backups\lojistik_*.dump`. Bunu ayrılmadan önce ya da firmadan birinin yardımıyla yap.
2. Dosyayı doğrudan sunucuya gönder. Kaynak bilgisayarda:
   ```powershell
   scp backups\lojistik_TARIH.dump root@SUNUCU_IP:/opt/lojistik/backups/
   ```
3. Sunucuda geri yükle:
   ```bash
   cd /opt/lojistik
   cat backups/lojistik_TARIH.dump | docker compose -f docker-compose.prod.yml exec -T db \
     pg_restore -U lojistik -d lojistik --clean --if-exists --no-owner --no-privileges
   docker compose -f docker-compose.prod.yml restart app
   ```
4. Siteye gir, kayıtların geldiğini kontrol et. Geri yüklenen veride şifreler eski haline döner;
   gerekiyorsa tekrar değiştir.

> Müşteri verisi firmaya aittir. Dökümü kaynaktan **doğrudan** sunucuya gönder; kendi
> bilgisayarında kopya tutma.

### 13. Yedekleri ve telefon uygulamasını ayarla

**Gecelik yedek**. Sunucuda:

```bash
crontab -e
```

En alta şu satırı ekle (her gece 02:00):

```
0 2 * * * /opt/lojistik/yedek.sh >> /var/log/lojistik-yedek.log 2>&1
```

Bir kez elle dene: `/opt/lojistik/yedek.sh`. Yedekler `/opt/lojistik/backups/` altında 14 gün tutulur.

> ⚠️ Bu yedekler **aynı sunucuda** durur; sunucu giderse yedekler de gider. Bu yüzden
> sağlayıcının panelinden **snapshot/yedekleme** hizmetini aç.

**Telefon uygulaması (APK):** `capacitor.config.ts` zaten `https://lojistik.enderlojistik.com`
adresini gösteriyor. GitHub → repo → **Actions** → son "Android" çalışmasını aç →
**Artifacts → lojistik-debug-apk** dosyasını indir ve operatör telefonlarına kur.
Uygulama arayüzü sunucudan canlı yüklendiği için sonraki güncellemelerde APK'yı yeniden kurmak
**gerekmez**. Yalnız kamera gibi native bir değişiklik yapılırsa yeniden kurulur.

**Eski sistemi kapat:** VPS doğrulandıktan sonra Render'daki servisi ve firma PC'sindeki
`BASLAT.bat` kullanımını bırak. Böylece iki ayrı veritabanına kayıt girilmez.

---

## BÖLÜM C — Günlük iş akışı

### 14. Değişiklik yap → yayına al

```
Kendi bilgisayarın                 GitHub                       VPS
─────────────────                  ──────                       ───
pnpm dev ile geliştir, dene
git commit + git push   ───────►   repo güncellenir
                                   (Actions APK üretir)
ssh lojistik
  cd /opt/lojistik && ./deploy.sh ◄── git pull ────────────►   yeni sürüm derlenir,
                                                                ~1 dk kesinti
```

Kendi bilgisayarında:

```powershell
cd apps\web; npx tsc --noEmit; cd ..\api; npx tsc --noEmit; cd ..\..   # hata olmamalı
git add -A
git commit -m "Ne değişti"
git push
```

Sonra yayına al:

```powershell
ssh lojistik "cd /opt/lojistik && ./deploy.sh"
```

> Yeni bir veritabanı migration'ı eklediysen ayrıca bir şey yapman gerekmez. Uygulama her
> açılışta `prisma migrate deploy` çalıştırır.

### Sık kullanılan sunucu komutları

Önce `ssh lojistik`, sonra `cd /opt/lojistik`:

| İş | Komut |
|---|---|
| Yeni sürümü yayına al | `./deploy.sh` |
| Kayıtları (log) izle | `docker compose -f docker-compose.prod.yml logs -f app` |
| Durum | `docker compose -f docker-compose.prod.yml ps` |
| Yeniden başlat | `docker compose -f docker-compose.prod.yml restart app` |
| Veritabanına gir | `docker compose -f docker-compose.prod.yml exec db psql -U lojistik -d lojistik` |
| Elle yedek | `./yedek.sh` |

### Yedekleri kendi bilgisayarına almak

Sunucu yedeklerini ayda bir sunucu dışına al. Bunu kendi bilgisayarına mı yoksa firmanın
belirlediği bir yere mi yapacağını firmayla konuş, çünkü içinde müşteri verisi var:

```powershell
scp "root@SUNUCU_IP:/opt/lojistik/backups/*" .\yedekler\
```

Geri yükleme adımları için bkz. [KURULUM.md → Geri yükleme](KURULUM.md#geri-yükleme).

---

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| `pnpm dev` → "named export not found" | `pnpm shared:build` çalıştır |
| API açılmıyor, "Can't reach database" | Docker Desktop açık mı? `docker compose up -d` |
| `prisma generate` → EPERM | Çalışan `pnpm dev`'i durdur (`Ctrl+C`), tekrar dene |
| Site açılıyor ama HTTPS hatası | DNS henüz yayılmamış ya da Cloudflare proxy açık; `docker compose -f docker-compose.prod.yml logs caddy` |
| Derleme sunucuda donuyor | Swap açık mı? `free -h` |
| APK açılıyor ama boş ekran | Sunucu çalışıyor mu? Tarayıcıdan siteyi aç |
