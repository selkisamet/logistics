# Sunucu Kurulumu — lojistik.enderlojistik.com

TR-VPS-3 (2 CPU / 2 GB RAM / 40 GB SSD, Ubuntu 24.04 LTS) üzerine kurulum.
Tek seferlik iş; bittikten sonra güncelleme tek komut (`./deploy.sh`).

Yığın: **Postgres + uygulama + Caddy**, hepsi Docker içinde.
Caddy HTTPS sertifikasını kendi alır ve kendi yeniler — sertifika işi yok.

---

## 1. DNS kaydı (sunucudan ÖNCE)

Alan adı panelinde (enderlojistik.com):

| Tip | Ad | Değer |
|-----|-----|-------|
| A | `lojistik` | *VPS'in IP adresi* |

Yayılmasını bekle (genelde dakikalar). Kontrol:

```bash
nslookup lojistik.enderlojistik.com
```

> **Cloudflare kullanıyorsan** turuncu bulutu (proxy) **kapat** — gri olsun.
> Açık kalırsa Caddy sertifika alamaz.

---

## 2. Sunucuyu hazırla

VPS'e root olarak bağlan (`ssh root@IP`), sonra:

```bash
# Sistem güncelle
apt update && apt upgrade -y

# Docker
curl -fsSL https://get.docker.com | sh

# Güvenlik duvarı — yalnız SSH + web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Saat dilimi
timedatectl set-timezone Europe/Istanbul
```

> 2 GB RAM'de derleme sıkışabilir. Sigorta olarak 2 GB swap aç:
> ```bash
> fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
> echo '/swapfile none swap sw 0 0' >> /etc/fstab
> ```

---

## 3. Projeyi indir ve ayarla

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/selkisamet/logistics.git lojistik
cd lojistik

cp .env.prod.example .env

# Parolaları üret (çıktıları .env'e yapıştır)
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET

nano .env
```

`.env` dolu hali şöyle görünmeli:

```
DOMAIN=lojistik.enderlojistik.com
POSTGRES_PASSWORD=<üretilen>
JWT_SECRET=<üretilen>
ANTHROPIC_API_KEY=<Anthropic anahtarın>
```

> `ANTHROPIC_API_KEY` yalnız irsaliye-no OCR'ı için. Boş bırakırsan o düğme hata
> verir, uygulamanın kalanı normal çalışır.
>
> **Eski anahtar bir kez git'e girmişti — onu kullanma, Anthropic panelinden
> yeni anahtar üret, eskisini iptal et.**

---

## 4. Başlat

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

İlk derleme 5–10 dakika sürer. İzlemek için:

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

Şunları görmelisin:

```
==> Veritabanı şeması uygulanıyor (prisma migrate deploy)
==> Giriş hesapları kontrol ediliyor (seed)
==> Uygulama başlıyor
API hazır: :3000/api
```

Sonra tarayıcıdan aç: **https://lojistik.enderlojistik.com**

İlk giriş: `admin@lojistik.local` / `admin123` →
**hemen Ayarlar'dan şifreyi değiştir** ve `operator@lojistik.local` / `operator123`
hesabını da elden geçir.

---

## 5. Yedek

> Uygulamada otomatik yedek betiği YOK. Veriyi korumak için sağlayıcının panelinden
> **snapshot/yedekleme** hizmetini açık tut.

---

## 6. APK'yı yeni adresle derle

[capacitor.config.ts](apps/web/capacitor.config.ts) artık
`https://lojistik.enderlojistik.com` gösteriyor. GitHub'a push edince
[Android workflow](.github/workflows/android.yml) tetiklenir → Actions →
run → **Artifacts → lojistik-debug-apk**.

Bu APK'yı bir kez kurduktan sonra **bir daha dokunmana gerek yok**: uygulama
web'i sunucudan canlı yüklüyor, `./deploy.sh` yeter. İleride hosting
değiştirsen bile yalnız DNS'i çevirirsin.

> Son CI derlemesi başarısızdı — push'tan sonra Actions sekmesini kontrol et.

---

## Günlük kullanım

| İş | Komut |
|----|-------|
| Yeni sürümü yayına al | `cd /opt/lojistik && ./deploy.sh` |
| Kayıtlara bak | `docker compose -f docker-compose.prod.yml logs -f app` |
| Durum | `docker compose -f docker-compose.prod.yml ps` |
| Yeniden başlat | `docker compose -f docker-compose.prod.yml restart app` |
| Veritabanına gir | `docker compose -f docker-compose.prod.yml exec db psql -U lojistik -d lojistik` |

**Sunucu yeniden başlarsa her şey kendiliğinden ayağa kalkar** (`restart: unless-stopped`).

---

## Notlar

- **Postgres dışarı kapalı.** Veritabanı portu internete açılmaz, yalnız Docker
  ağından erişilir. Dışarıdan bağlanman gerekirse SSH tüneli kullan.
- **`caddy_data` volume'ünü silme** — sertifikalar orada. Silersen Let's Encrypt
  haftalık limitine takılabilirsin.
- **Eski veriyi taşıyacaksan** Supabase'den `pg_dump` alıp yukarıdaki geri
  yükleme adımıyla aktar. Fotoğraflar Render free diskte olduğu için muhtemelen
  zaten kaybolmuştur.
