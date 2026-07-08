# CLAUDE.md — Tesellüm & Depo (3PL WMS)

> Bu dosya her yeni Claude Code oturumunda otomatik yüklenir. Amaç: yeni oturumun
> projeyi sıfırdan keşfetmeden, bağlamı ve kuralları bilerek devam etmesi.
> Kullanıcı Türkçe konuşur; arayüz ve cevaplar Türkçe olmalı.

## Proje nedir

550 m² düz zeminli (rafsız) orta ölçekli bir 3PL deposu için **mal kabul (tesellüm) →
depolama → sevkiyat** uygulaması. Müşteriler belirsiz yük bilgisiyle araç ister, irsaliye
mal depoya gelince elde olur, bazı yük cross-dock (hemen çıkar), bazısı birkaç gün bekler.
Çekirdek ihtiyaç: **depoda ne var bilmek + sevkiyat yapmak**, **palet bazlı QR takip** ile.

**Kullanıcı net istedi:** AI ile TÜM etiket/belge OCR'ı İSTEMİYOR (kötü foto → yanlış kayıt).
İstisna (onaylandı): mal kabulde **yalnızca İrsaliye/Sipariş No**'yu fotoğraftan okuyup
**düzenlenebilir input'a** yazan dar OCR (kullanıcı kaydetmeden kontrol eder). Bkz. Native uygulama.
Genel ayar tercihi: en mantıklı/sade çözüm, az tık, hata riskini azaltan akış.

Kurulum/çalıştırma detayları için ayrıca [README.md](README.md).

## Çalıştırma

- **Tek tık:** `BASLAT.bat` — taşınabilir Postgres'i başlatır (pg_isready ile bekler) + web & api.
  `DURDUR.bat` Postgres'i durdurur. `TUNEL.bat` cloudflared HTTPS tüneli (telefon kamerası
  getUserMedia için HTTPS şart). `YEDEKLE.bat` / `GERI_YUKLE.bat` pg_dump yedek/geri yükleme.
- **Geliştirme:** `pnpm dev` (web :5173, api :3000/api). Web, `/api` ve `/uploads`'ı proxy'ler;
  `VITE_API_URL=""` (aynı-köken, relative).
- **Postgres taşınabilir:** `.tools/pgsql`, veri `.tools/pgdata`, trust auth, port 5432, db `lojistik`.
  Windows servisi DEĞİL — her oturumda başlatılmalı. `LojistikYedek` zamanlanmış görevi her gün 13:00 yedek alır.

## Native uygulama (Capacitor / Android APK)

Operatörün telefonunda **web kamerası (getUserMedia) otomatik odaklamıyordu** (bulanık, yanlış OCR)
ve `<input capture>` arka kamerayı açtıramıyordu. Çözüm: uygulamayı **Capacitor 6** ile Android APK'sına
sardık. Kamera **@capacitor-community/camera-preview** (CameraX) ile: `position:'rear'` → **arka kamera
zorlanır**, native **otomatik odak** → net. [WaybillCamera.tsx](apps/web/src/components/WaybillCamera.tsx)
native önizlemeyi WebView ARKASINDA render eder; bu yüzden modal **`document.body`'ye portal** edilir ve
kamera açıkken **`#root` gizlenir** (`.wb-camera-active`, [index.css](apps/web/src/index.css)) ki WebView
saydam olsun. Çekilen foto `POST /ocr/waybill`'e gider. Tarayıcıda (dev) `<input capture>` yedeği kullanılır
(`isNativeApp()` ayrımı — [lib/config.ts](apps/web/src/lib/config.ts)).

- **APK derleme:** yerelde Android SDK YOK. `apps/web` ya da `packages/shared`'a her push'ta
  **GitHub Actions** ([.github/workflows/android.yml](.github/workflows/android.yml)) bulutta **debug APK**
  üretir → run sayfası → **Artifacts → tesellum-debug-apk**. `gradlew` git'te +x (100755) olmalı.
- **Ayarlanabilir sunucu adresi:** APK'da web varlıkları gömülü, aynı-köken yok. Giriş ekranında
  **"Sunucu adresi"** alanı (native'de ya da elle ayarlanınca görünür) → backend/tünel URL'si girilir,
  localStorage'da saklanır. `lib/api.ts` `getApiBase()` kullanır. Tünel değişince APK'yı değil, sadece
  bu alanı güncelle. (İleride kalıcı adres yapılınca bu sabitlenir.)
- **Capacitor komutları** `apps/web`'ten: `pnpm exec cap sync android`. `capacitor.config.ts` `webDir: dist`.
  CI derlemeyi izlemek için (repo public): GitHub REST API `/actions/runs` (auth'suz okunur; loglar auth ister).

## Monorepo

```
apps/web      React 18 + Vite 6 + TS + Tailwind v3 + React Router v6 + TanStack Query v5
              + Zustand + react-hook-form + zod; PWA; @zxing/browser (QR), qrcode.react
apps/api      NestJS 10 + Prisma 6 + PostgreSQL; JWT (passport-jwt); zod ZodValidationPipe; bcryptjs; multer
packages/shared  zod şemaları + türetilmiş tipler — TEK kaynak (front+back)
```

## Kritik konvansiyonlar (bunları bilmeden değişiklik yapma)

- **shared ÇİFT derleme:** `tsconfig.cjs.json` (NestJS/CJS) + `tsconfig.esm.json` (Vite/ESM).
  shared'ı her değiştirdiğinde: `pnpm --filter @lojistik/shared build`. Aksi halde Vite
  "named export not found" (CJS) hatası verir. `exports` map import/require ayrımı kritik.
- **Doğrulama zod ile:** `ZodValidationPipe`. `main.ts`'te global `ValidationPipe` YOK
  (class-validator kullanılmıyor — eklemeyin, boot çöker).
- **Otomatik kodlar** (`apps/api/src/common/codes.ts`): müşteri `MST0001`, depo slug `MERKEZ_DEPO`,
  ASN `ON-YYYYMMDD-XXXX`, mal kabul `TES-...`, sevkiyat `SVK-...` — `datedReference()` + `randomCode()`,
  P2002 çakışmasında retry. **SKU otomatik DEĞİL** (anlamlı olmalı) — opsiyonel.
- **Roller:** ADMIN / SUPERVISOR / OPERATOR. ASN rotaları admin/supervisor; receipts & dispatches
  herhangi bir oturum açmış kullanıcı (operatör sevk eder).
- **Arayüz dili Türkçe.** Bildirimler inline değil **toast** (`lib/toast.ts`) — akışı bozmasın.

## Domain akışı

**Ön İhbar (ASN)** → **Mal Kabul (Receipt)** → **Palet (Package, benzersiz QR)** →
**Depo (stok = tamamlanmış ama sevk edilmemiş paletler)** → **Sevkiyat (Dispatch)**.

- ASN: oto referans, opsiyonel araç/tarih, **çoklu kaynak** (müşteri deposu + serbest metin) ve
  **çoklu alıcı** (firmanın kendi müşterileri = malın gideceği taraf; CustomerRecipient + ShipmentRecipient,
  kaynak deseninin birebir aynası; müşteri detayında yönetilir, ön ihbarda çoklu seçilir).
  Satır = **Açıklama + Adet** (SKU/Barkod kaldırıldı; müşteri belgelerinde İrsaliye No + Sipariş No + irsaliye QR var, ürün barkodu yok).
- Mal Kabul: sayım (satırlar **id** ile güncellenir, SKU boş olabilir), **İrsaliye No + Sipariş No** (Belge Bilgileri),
  toplu palet QR etiketi üretimi (adet girilir), tamamla. Kör kabul (ASN'siz) da var.
- **Tesellüm fişi:** mal kabul başlığındaki "🖨️ Tesellüm Fişi" ile her durumda basılır (`ReceiptSlipModal`,
  [ReceiptCountPage.tsx](apps/web/src/pages/ReceiptCountPage.tsx)). Klasik **"Ambar Tesellüm Fişi"** form düzeni,
  **A5 YATAY**: kaşe/QR + ünvan, fiş bilgileri (seri/sıra no=fiş ref, tarih, gönderici sevk irs.=irsaliye no,
  sipariş no, ön ihbar), Alıcı/Teslim Alan (ambar) + Gönderen/Teslim Eden (müşteri) blokları, MALIN CİNSİ tablosu
  (Sıra·Cins·Adet·Kap·Kg·Ücret; kap/kg/ücret elle), gönderici/alıcı ödemeli kutuları, "tam ve sağlam teslim aldım"
  beyanı + kaşe. **Baskı `react-to-print` ile** (izole iframe → sayfalama düzgün, kırpılma/tekrarlama YOK; eski
  `window.print()`+`position:absolute` hilesi kaldırıldı — o yaklaşım fixed-modal'ı her sayfada tekrarlıyordu).
  `@page`/ölçü `useReactToPrint({ pageStyle })` ile verilir; kök `.slip-doc`. **QR etiketleri hâlâ eski
  `window.print()`+`.qr-print`/`.print-sheet` ile** (değişmedi) — [index.css](apps/web/src/index.css).
  - **3 baskı modu** (aynı DOM → hizalama otomatik): `full`=boş kağıda tam; `data`=matbu forma **yalnız veri**
    (dot-matrix/karbonlu koçan için; çerçeve+etiketler saydam); `blank`=matbaaya verilecek **boş form master**
    (veriler+QR gizli). Statik parçalar `.slip-chrome`, değişkenler `.slip-data`; `.slip-hide-chrome` /
    `.slip-hide-data` sınıfları (global, `@media print` dışı) ile — [index.css](apps/web/src/index.css).
  - **2 yerleşim** (`pageStyle` @page'i buna göre): `a5`=tek fiş (A5 yatay); `a4x2`=**A4 dikeye alt alta 2 fiş**
    (`.slip-a4`; iki `.slip-copy` h-140mm + ortada ✂ kesik çizgi → kesip 2 A5 elde et). Form gövdesi tek
    `SlipForm` bileşeni; modalda tek `ref={printRef}`'li `.slip-doc`, içerik yerleşime göre 1 ya da 2 SlipForm.
  - **QR = fişi açan link** (`${origin}/mal-kabul/${receipt.id}`; okutunca mal kabul kaydı açılır — data). **Marka:**
    fiş başında **logo** (`apps/web/public/logo.png`, yoksa gizlenir) + firma adı/slogan; altta **iletişim şeridi**
    (tel/e-posta/adres/web). Firma bilgileri [lib/company.ts](apps/web/src/lib/company.ts) `COMPANY` sabitinden.
- Palet bazlı **kısmi sevk** desteklenir. Sevkiyatta QR okut: tek palet ya da "girişin tümü";
  "Hepsini Ekle"; "Bu araca planlı (N)".
- **Planlanan araç:** ASN.vehicleId stok ve sevkiyat paletlerine taşınır (operatör hangi yükün
  hangi araca gideceğini görür). Depo kartında rozet. `PATCH /asn/:id/vehicle` ile plan değiştirilebilir
  (iptal hariç her durumda; ön ihbar detayından — yönetici/şef).
- **Hızlı Sevk:** Depo kartındaki "🚚 Sevk Et" → `POST /dispatches/quick` { receiptId, vehicleId? }.
  Plaka ELLE YAZILMAZ, kayıtlı araç listeden seçilir (planlanan ön-seçili). Tek adımda sevk eder.
- Sevkiyat detayında yeşil/turuncu araç eşleştirmesi YALNIZCA taslakta "Depodan Palet Ekle"
  listesinde (yüklenmiş/sevk edilmiş paletlerde gösterilmez — yanıltıcıydı).

## Tasarım sistemi (UI)

- **Panel düzeni** ([AppLayout.tsx](apps/web/src/components/AppLayout.tsx)): masaüstünde solda sabit
  sidebar (gruplu menü + alt kullanıcı kartı), sağda içerik. **Mobilde**: üstte hamburger + başlık,
  soldan kayan çekmece (aynı sidebar), altta tab bar (5 ana bölüm) — native app hissi.
- **İkonlar:** emoji DEĞİL, çizgi-ikon seti [icons.tsx](apps/web/src/components/icons.tsx) (`<Icon name=.../>`, currentColor).
- **Card** ([ui.tsx](apps/web/src/components/ui.tsx)): `rounded-md` (6px), yumuşak gölge.
- **Liste aralığı:** kart listelerinde `flex flex-col gap-4` kullan — `space-y-*` KULLANMA:
  kartlar `<Link>` (inline `<a>`) ile sarılı olduğundan üst-margin çalışmaz, kartlar yapışır. `gap` her zaman çalışır.
- Plaka girişleri `PlateInput` ile maskelenir (34 GTY 70 / 34 L 3393 vb.).

## Veritabanı / Prisma kuralları

- **Migration:** eklemeli (additive) değişiklik → `prisma migrate dev`. Yıkıcı/veri-kaybı →
  elle `migration.sql` + `prisma migrate deploy` (non-interactive ortamda `migrate dev` bloklanır).
- **Client üretimi EPERM:** `prisma generate` çalışan BASLAT node süreçleri motor DLL'ini kilitler.
  Çözüm: önce node'u durdur (`Stop-Process -Name node -Force`), `pnpm prisma generate`, sonra tekrar BASLAT.
- **Modeller:** User, Customer, CustomerLocation, CustomerRecipient, Warehouse, Location,
  InboundShipment(+vehicleId,sources,recipients), ShipmentLine, ShipmentSource, ShipmentRecipient,
  Receipt(+waybillNo, orderNo, dispatchId), ReceiptLine, Package(+dispatchId,
  dispatchedAt), Discrepancy, Attachment, Dispatch(+vehicleId, packages), Vehicle(type=String), AuditEvent.

## Doğrulama (değişiklik sonrası)

- Web: `cd apps/web && npx tsc --noEmit`. API: `cd apps/api && npx tsc --noEmit`. shared: build.
- Sadece web (CSS/TSX) değiştiyse Vite HMR yeniler, restart gerekmez. API/shared değiştiyse BASLAT'ı yeniden başlat.

## Tuzaklar / workaround'lar

- **Test girişi:** Kullanıcı admin şifresini DEĞİŞTİRDİ (admin123 çalışmaz). Test için geçici admin
  ekle (psql), bitince sil. e-posta zod-geçerli olmalı (örn. `tmpadmin@test.com`), şifre bcrypt hash'li.
- **PowerShell** PascalCase tablo adlarını `psql -c` ile bozar → SQL'i dosyaya yazıp `psql -f` kullan.
  Geçici dosya temizliğinde `Remove-Item` ara sıra bloklanır → Bash `rm` kullan.
- **Telefon kamerası** HTTPS ister (cloudflared tüneli). Kamera siyah ekran sorunu StrictMode çift-mount
  kaynaklıydı; BarcodeScanner deferred start (setTimeout) + yüksek çözünürlük ile çözüldü.

## Güvenlik yapılacaklar

- `apps/api/.env` içine bir kez gerçek **ANTHROPIC_API_KEY** yapıştırılmıştı → **rotate edilmeli**.
- Varsayılan demo şifreleri (operator123 vb.) prod kullanımda değiştirilmeli.

## Bekleyen / sonraki

- "Kalıcı kurulum": Postgres'in Windows açılışında oto-başlaması + kalıcı adres/HTTPS (kullanıcı "sonra" dedi).
- İstenirse: aynı araca planlı çok kartı tek sevkiyatta birleştirme; sayfa içi emoji'leri çizgi-ikona geçirme.

---
**Bu dosyayı güncel tut:** Mimari/akış kararı değiştikçe ilgili satırı güncelle. Detaylı, kalıcı
notlar için `.claude/.../memory/` (MEMORY.md indeksli) kullanılır; bu CLAUDE.md ise her oturumda yüklenen özet bağlamdır.
