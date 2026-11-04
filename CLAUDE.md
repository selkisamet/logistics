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
**Yapay zekâ (Claude) OCR'ı tamamen KALDIRILDI** (maliyet + "AI tahmini forma yazılmasın").
Mal kabulde İrsaliye/Sipariş No **telefonda, ücretsiz** okunur — bkz. "İrsaliye no okuma" (Native uygulama).
API'de `/ocr` modülü, `@anthropic-ai/sdk` ve `ANTHROPIC_API_KEY` YOK; geri eklemeyin.
Genel ayar tercihi: en mantıklı/sade çözüm, az tık, hata riskini azaltan akış.

Kurulum/çalıştırma detayları için ayrıca [README.md](README.md). **Kendi bilgisayarında kurulum +
oradan VPS'e yayın + günlük iş akışı:** [GELISTIRME.md](GELISTIRME.md) (üretim: VPS'te Docker,
`lojistik.enderlojistik.com`, güncelleme `ssh ... ./deploy.sh`; sunucu ayrıntısı [KURULUM.md](KURULUM.md)). Önceki makineden taşınan Claude hafızası/tercihleri:
[docs/claude-notlar.md](docs/claude-notlar.md) — oturum başında oku.

## Çalıştırma

- **Yerel geliştirme:** `docker compose up -d` (yerel Postgres) + `pnpm dev` (web :5173, api :3000/api).
  Web, `/api` ve `/uploads`'ı proxy'ler; `VITE_API_URL=""` (aynı-köken, relative).
- **Üretim:** VPS'te Docker (`docker-compose.prod.yml` + Caddy), güncelleme `./deploy.sh`.
- Kökte yalnız çalışma için gerekli dosyalar tutulur — yedek/geri yükleme/sıfırlama/durdurma
  `.bat`/`.ps1`/`.sh` betikleri ve `render.yaml` kullanıcı isteğiyle KALDIRILDI (geri eklemeyin).
  Veri koruması sağlayıcının snapshot hizmetiyle.

## Native uygulama (Capacitor / Android APK)

Operatörün telefonunda **web kamerası (getUserMedia) otomatik odaklamıyordu** (bulanık, yanlış OCR)
ve `<input capture>` arka kamerayı açtıramıyordu. Çözüm: uygulamayı **Capacitor 6** ile Android APK'sına
sardık. Kamera **@capacitor-community/camera-preview** (CameraX) ile: `position:'rear'` → **arka kamera
zorlanır**, native **otomatik odak** → net. [NativeCamera.tsx](apps/web/src/components/NativeCamera.tsx)
native önizlemeyi WebView ARKASINDA render eder; bu yüzden modal **`document.body`'ye portal** edilir ve
kamera açıkken **`#root` gizlenir** (`.wb-camera-active`, [index.css](apps/web/src/index.css)) ki WebView
saydam olsun. Tarayıcıda (dev) `<input capture>` yedeği kullanılır
(`isNativeApp()` ayrımı — [lib/config.ts](apps/web/src/lib/config.ts)).

- **İrsaliye no okuma (AI YOK, cihaz üzerinde, 0 ₺):** mal kabul başlatta ilk irsaliye fotoğrafı
  [lib/docReader.ts](apps/web/src/lib/docReader.ts) `scanWaybill()` ile okunur:
  1. **QR (e-irsaliye GİB karekodu, JSON `no` alanı)** → numara **doğrudan** yazılır (dijital, hatasız;
     "FATURA" geçen kod yazılmaz, yalnız aday olur).
  2. QR yoksa **ML Kit metin tanıma** → [lib/waybillScan.ts](apps/web/src/lib/waybillScan.ts)
     `analyzeWaybill()` aday numaralar çıkarır (etiket "İrsaliye No/Sipariş No" + tablo komşusu, e-belge
     biçimi `ABC2026000000001` + O→0/I→1 düzeltmesi; vergi/telefon/IBAN/ETTN/adres/tarih/tutar elenir).
     **Adaylar ASLA kendiliğinden yazılmaz** — "İrsaliye No hangisi?" çiplerinden depocu seçer.
  3. Hiçbiri yoksa alan açılır, elle yazılır.
  Native taraf: **uygulamaya özel Capacitor eklentisi** `DocReader`
  ([DocReaderPlugin.java](apps/web/android/app/src/main/java/com/lojistik/tesellum/DocReaderPlugin.java),
  `MainActivity`'de `registerPlugin`), ML Kit **bundled** modeller (`text-recognition`, `barcode-scanning`
  — app/build.gradle; internetsiz). ML Kit EXIF okumaz → görsel JS'te `toUprightJpeg()` ile dik çizilip
  base64 gönderilir. Eklenti yoksa (tarayıcı / eski APK) `@zxing/browser` ile yalnız QR denenir.
- **Web canlı yüklenir:** `capacitor.config.ts` `server.url` = prod adres → web değişiklikleri APK'sız gelir;
  yalnız **native** değişiklik (eklenti, gradle) yeni APK ister.
- **APK derleme:** yerelde Android SDK YOK. `apps/web/android/**`, `capacitor.config.ts`, `apps/web/package.json`
  değişip push'lanınca **GitHub Actions** ([.github/workflows/android.yml](.github/workflows/android.yml))
  bulutta **debug APK** üretir → run sayfası → **Artifacts → lojistik-debug-apk**. `gradlew` git'te +x (100755) olmalı.
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
- **Girilen METİNLER BÜYÜK HARF** ([shared/text.ts](packages/shared/src/text.ts)): kullanıcılar aynı
  bilgiyi farklı yazıyordu ("arkem kimya"/"Arkem Kimya") → belge ve listeler tutarsızdı.
  `upperStr()`/`upperOpt()` **zod `.transform()`'u** ile şemada normalize edilir; `ZodValidationPipe`
  `parse()` sonucunu döndürdüğü ve tüm `@Body`'ler pipe'tan geçtiği için bu **TEK yazma hunisidir**
  (yeni serbest metin alanı eklerken bunları kullan). Türkçe eşleme şart: `trUpper` =
  `toLocaleUpperCase('tr-TR')` — düz `toUpperCase()` "işi"yi "ISI" yapar, doğrusu "İŞİ".
  Kod/slug alanları (`[A-Za-z0-9_-]` regex'li: müşteri/depo kodu, irsaliye seri/no) `codeOpt()` ile
  **ASCII** büyütülür — `İ` regex'i ihlal ederdi. **Dokunulmayanlar:** e-posta, şifre, telefon,
  vergi no, arama metni (`search`), id'ler. UI'da `Input` **değeri yazarken gerçekten büyütür**
  (`trUpper`, imleç korunur; `uppercase` sınıfı + `autoCapitalize="characters"`; `type`
  email/password/tel/number/date/url/**search** ise hariç). Android klavyesi "composition" ile yazdığı için
  kompozisyon sırasında DOKUNULMAZ, `compositionend`'de çevrilir (aksi halde harfler çiftlenir).
  Combobox arama kutuları yalnız görsel büyütür (eşleşme `norm` ile). Sunucu normalizasyonu son güvence.
- **Sayı biçimi TSE/tr-TR** ([lib/format.ts](apps/web/src/lib/format.ts)): `formatMoney` (₺12.345,50),
  `formatAmount` (simgesiz), `formatWeight` (kg, ≤3 ondalık), **`formatCount`** (adet — **ondalık YOK**,
  yalnız binlik: 1.250; "5 palet" asla "5,00" olmaz). Belgelerde satır `qty` **sayı olarak** taşınır,
  biçimlendirme basımda yapılır — aksi halde toplam `Number("1.250")=1.25` olur.

## Domain akışı

**Ön İhbar (ASN)** → **Mal Kabul (Receipt)** → **Palet (Package, benzersiz QR)** →
**Depo (stok = tamamlanmış ama sevk edilmemiş paletler)** → **Sevkiyat (Dispatch)**.

- ASN: oto referans, opsiyonel araç/tarih, **çoklu kaynak** (müşteri deposu + serbest metin) ve
  **çoklu alıcı** (firmanın kendi müşterileri = malın gideceği taraf; CustomerRecipient + ShipmentRecipient,
  kaynak deseninin birebir aynası; müşteri detayında yönetilir, ön ihbarda çoklu seçilir).
  Satır = **Malın Cinsi + Adet + Nevi (kap) + opsiyonel Birim Fiyat** (SKU/Barkod kaldırıldı; müşteri belgelerinde İrsaliye No + Sipariş No + irsaliye QR var, ürün barkodu yok).
  - **Nevi (kap):** `ShipmentLine.unit`/`ReceiptLine.unit` (serbest metin, Türkçe **etiket** saklanır).
    Seçenekler `KAP_TYPES` ([shared/schemas/receipt.ts](packages/shared/src/schemas/receipt.ts)) =
    `Object.values(PACKAGE_TYPE_LABELS)` — **QR palet tipleriyle TEK liste** (Palet/Varil/Koli/Kasa/
    Torba-Çuval/Big-bag/**IBC**/Adet/Diğer), ayrışmasın. Varsayılan `'Palet'`. Ön ihbar satırında ve
    kör kabulün "Kalem Ekle" modalında `<Select>` ile seçilir; mal kabule kopyalanır.
    **Basıldığı yerler:** taşıma irsaliyesi **NEVİ** sütunu (`unitLabel()`, kap satırında enum → etiket)
    ve tesellüm fişi **KAP** sütunu (`kapLabel()`; eskiden elle doldurulurdu). Eski kayıtlardaki ham
    `'ADET'` her üç yerde etikete normalize edilir (`toKap()` ön ihbar düzenlemede — aksi halde
    listede olmayan değer seçimi boşaltıp kaydedince kapı silerdi).
  - **Kilo (`weightKg`)**: kalemin TOPLAM ağırlığı (müşterinin irsaliyesindeki gibi), opsiyonel.
    `ShipmentLine` → `ReceiptLine`'a kopyalanır → `DispatchItem`'a **snapshot**'lanır; taşıma
    irsaliyesi **KİLO** ve tesellüm fişi **KG** sütunlarına basılır (eskiden elle dolduruluyordu).
    Girilmemişse hücre **boş** kalır — matbu formda elle yazılabilsin. **Kısmi sevkte oransal**
    ([dispatch.service.ts](apps/api/src/dispatch/dispatch.service.ts) `portionWeight`/`perPackageWeight`):
    kalemde `kg × qty/countedQty`; kapta palet–kalem bağı OLMADIĞI için (tek-granülerlik kuralı)
    kabulün toplam kilosu palet sayısına eşit paylaştırılır → yaklaşık ama tutarlı.
  - **Son teslim tarihi (`deliveryBy`, termin)**: ön ihbar başlığında, opsiyonel. `expectedAt`
    malın GELECEĞİ gün, `deliveryBy` GİTMESİ GEREKEN son gün. Depo ekranında `DueBadge`
    ("2 gün kaldı" / "1 gün GECİKTİ") ve **sıralama** bundan gelir: `findStock`
    `orderBy: [{shipment:{deliveryBy:'asc'}}, {completedAt:'asc'}]` — Postgres ASC'te NULL'lar
    sona düştüğü için terminsiz yükler altta kalır. Kopyalanmaz; `serializeReceipt` ön ihbardan
    yüzeye çıkarır (tek kaynak `InboundShipment`).
  - **Taraf/adres/ödeme/fiyat (opsiyonel, fişe yansır)** — InboundShipment'ta additive:
    `paymentType` ('SENDER'|'RECIPIENT'), `showAmountOnSlip` (gönderici ödemeli iken
    ücret göster), `vatIncluded` (KDV dahil mi; `VAT_RATE=0.2`). **Müşteri=Gönderici** (malın sahibi).
    (`principalName`/"İşi Veren/Cari" alanı KALDIRILDI — kolon dormant; gönderici/alıcı yeterli görüldü.)
    Satır `unitPrice` (Decimal) → ReceiptLine'a kopyalanır. **Adresler:** `ShipmentSource`/`ShipmentRecipient`'e
    seçilen kaydın `address`'i snapshot'lanır; fişte **her yükleme/teslim noktası ayrı listelenir** (kaynak yoksa
    müşteri fatura adresi). `CustomerLocation`/`CustomerRecipient` = ad+adres+**telefon**, müşteri detayından
    düzenlenebilir (PATCH). Fiş receipt→shipment yolundan besleniyor (serializeReceipt sources/recipients+adres
    ve customer.address'i yüzeye çıkarır). (`loadAddress`/`deliveryAddress` kolonları duruyor ama fiş artık listeyi
    kullanıyor.)
- Mal Kabul: sayım (satırlar **id** ile güncellenir, SKU boş olabilir), **İrsaliye No + Sipariş No** (Belge Bilgileri),
  toplu palet QR etiketi üretimi (adet girilir), tamamla. ASN'siz kabul de var — arayüzde "Kör kabul" diye ETİKETLENMEZ (depocu malı irsaliyeyle görerek alıyor; listede Öİ yoksa İrs. no gösterilir).
  - **İrsaliye görüntüleri (foto):** mal kabul detayında "İrsaliye Görüntüleri" kartı (`AttachmentsCard`,
    [ReceiptCountPage.tsx](apps/web/src/pages/ReceiptCountPage.tsx)) — çoklu foto yüklenir, galeri + sil.
    **OCR YOK** (belge kaydı olarak saklanır; irsaliye-no okuma ayrı, mal kabul başlatta). `Attachment`
    modeli artık `discrepancyId` VEYA `receiptId` ile bağlanabilir (ikisi opsiyonel). Endpoint:
    `POST /receipts/:id/attachments` (FilesInterceptor, tek adımda yükle+bağla) + `DELETE /receipts/:id/attachments/:attachmentId`;
    yalnız IN_PROGRESS'te eklenir/silinir (`ensureInProgress`). `serializeReceipt` `attachments`'ı yüzeye çıkarır.
- **Araç Görevi + Depo Bölgesi** (sorun: irsaliyede gerçek teslim adresi yazmıyor, depocu malı
  nereye koyacağını bilmiyordu). **Hepsi OPSİYONEL — hiçbir adım akışı durdurmaz** (eski ön ihbar
  ZORUNLU olduğu için kaldırılmıştı; aynı hataya düşme). Kamyoncuya iş yok, müşteri aranmaz.
  - **`Region`** (Bölgeler, Tanımlar menüsü — [RegionsPage](apps/web/src/pages/RegionsPage.tsx)):
    depodaki sevk alanları (GEBZE, ÇORLU…). **"BEKLEYEN" kayıt DEĞİL** = `regionId null`
    (`PENDING_REGION_LABEL`). Kullanılmış bölge silinmez (409) → pasife alınır (FK SET NULL malları
    sessizce BEKLEYEN'e düşürürdü).
  - **`Receipt.regionId`** = gideceği bölge, **`storedRegionId`** = fiilen durduğu bölge. Kabulde
    ikisi eşit açılır. Bölge sonradan girilince yalnız `regionId` değişir → farklıysa
    **"Yer değiştir: BEKLEYEN → GEBZE"** görevi (`needsRelocation()`); depocu **"Taşındı"** der
    (`POST /receipts/:id/relocated` → eşitler). `PATCH /receipts/:id/region` **rol kısıtsız**
    (bilgiyi kim öğrenirse girer). Ortak UI: [RegionPlacement](apps/web/src/components/RegionPlacement.tsx)
    (mal kabul detayı + depo kartları). Depo ekranında bölge süzgeci + "Yer değiştir (N)" çipi.
  - **`PickupTask`** (Araç Görevleri — [PickupTasksPage](apps/web/src/pages/PickupTasksPage.tsx),
    ADMIN/SUPERVISOR; mobil alt çubukta "Görevler"): yönetici/sevkiyat müdürü **aracı yüke
    gönderirken** açar: gönderici + plaka (zorunlu), bölge/alıcı (biliniyorsa). Kartta bölge tek
    dokunuşla girilir. `OPEN` → depoya gelince `RECEIVED` (+`receiptId`) / `CANCELLED`.
  - **Plakayla eşleştirme:** Mal Kabul Başlat'ta üstte "Gelen araç hangisi?" — açık görevlerin
    plakaları. Depocu dokununca gönderici/alıcı/bölge dolar, `pickupTaskId` ile başlatılır; sunucu
    görevi `updateMany({status:OPEN})` ile kapatır (iki depocu aynı anda dokunursa tek bağ).
    **`regionId`/`recipientCustomerId`: `undefined` = görevdekini al, `null` = depocu bilerek
    boşalttı** (istemci ekrandaki değeri hep gönderir). Kabul iptal → görev tekrar `OPEN`.
    Ekranda büyük **"Malı koy: GEBZE"** satırı = depocunun asıl sorusu.
  - **Spot araç** (firmaya ait olmayan, o iş için tutulan): plaka kutusuna yazılır → "+ PLAKA ekle"
    → `POST /vehicles/quick` anında `Vehicle{isSpot:true, type:'DİĞER'}` açar. **Aynı plaka
    boşluk farkıyla da varsa YENİSİ AÇILMAZ** (`plateKey`), mevcut döner (pasifse aktifleşir).
    `Combobox` `onCreate` + `formatQuery={formatPlate}` ("34abc" → "34 ABC" ile aranır);
    `useQuickVehicle()` + `vehicleOptions()` ([lookups.ts](apps/web/src/lib/lookups.ts)). Bağlı yerler:
    Araç Görevi formu, Ticari Bilgiler → Planlanan Araç. Depo araç şeridinde spot araç yalnız işi
    (planlı yük/açık sefer) varsa görünür. Araçlar sayfasında "spot" rozeti + işaret kaldırılabilir.
  - **Araç sahipliği etiketi:** plaka listelerinde sağda rozet **ÖZMAL** (firmanın kendi aracı —
    sektör terimi) / **SPOT** (`vehicleOwnership()`; `ComboOption.badge`/`badgeTone`).
  - **Tahmini geliş** (`PickupTask.expectedDate` @db.Date + `expectedTime` "HH:MM", AYRI — bilinmeyen
    saat 00:00 ile karışmasın). Formda [Bugün][Tarih seç][Bilinmiyor] ("Yarın" düğmesi kullanıcı
    isteğiyle kaldırıldı — takvimden seçilir), **varsayılan Bugün**, saat opsiyonel. Görev formunda
    **Not alanı yok** (hiçbir yere aktarılmıyordu; `PickupTask.note` kolonu dormant). Açık görevler geliş sırasıyla (tarih, saat, NULL'lar sonda). Etiket
    [lib/eta.ts](apps/web/src/lib/eta.ts) `etaLabel()` — "Bugün 14:30", "Yarın", "Gecikti · 08.10";
    gün YEREL saatle (`localDay`, toISOString UTC kaydırırdı). Tarih silinince saat de silinir.
  - Sonraki adım (yapılmadı): geçmişten bölge önerisi (aynı alıcı/gönderici→alıcı nereye gittiyse).
- **Tesellüm fişi:** mal kabul başlığındaki "🖨️ Tesellüm Fişi" ile her durumda basılır (`ReceiptSlipModal`,
  [ReceiptCountPage.tsx](apps/web/src/pages/ReceiptCountPage.tsx)). Klasik **"Ambar Tesellüm Fişi"** form düzeni,
  **A5 YATAY**: kaşe/QR + ünvan, fiş bilgileri (seri/sıra no=fiş ref, tarih, gönderici sevk irs.=irsaliye no,
  sipariş no, **getiren araç** = `pickupVehiclePlate` — eski ÖN İHBAR satırının YERİNDE, geometri
  sabit kalsın diye; sevk aracı DEĞİL), Alıcı/Teslim Alan (ambar) + Gönderen/Teslim Eden (müşteri) blokları, MALIN CİNSİ tablosu
  (Sıra·Cins·Adet·Kap·Kg·Ücret; **kap kalemin nev'inden basılır**, kg/ücret elle), gönderici/alıcı ödemeli kutuları, "tam ve sağlam teslim aldım"
  beyanı + kaşe. **Baskı `react-to-print` ile** (izole iframe → sayfalama düzgün, kırpılma/tekrarlama YOK; eski
  `window.print()`+`position:absolute` hilesi kaldırıldı — o yaklaşım fixed-modal'ı her sayfada tekrarlıyordu).
  `@page`/ölçü `useReactToPrint({ pageStyle })` ile verilir; kök `.slip-doc`. **QR etiketleri hâlâ eski
  `window.print()`+`.qr-print`/`.print-sheet` ile** (değişmedi) — [index.css](apps/web/src/index.css).
  - **Baskı kabuğu ORTAK:** [PrintableDocModal](apps/web/src/components/print/PrintableDocModal.tsx)
    (mod/nüsha seçici + `useReactToPrint` + `pageStyle`; render-prop ile gövde alır) ve
    [FormLines](apps/web/src/components/print/FormLines.tsx) (`MetaLine`/`FieldLine`). Tesellüm fişi ve
    **Taşıma İrsaliyesi** bunları paylaşır — `pageStyle`'daki `body * { visibility: visible !important }`
    (index.css'teki QR `@media print` kuralının iframe'e sızmasını iptal eder) tek yerde durur.
  - **3 baskı modu** (aynı DOM → hizalama otomatik): `full`=boş kağıda tam; `data`=matbu forma **yalnız veri**
    (dot-matrix/karbonsuz koçan için; çerçeve+etiketler saydam); `blank`=matbaaya verilecek **boş form master**
    (veriler+QR gizli). Statik parçalar `.slip-chrome`, değişkenler `.slip-data`; `.slip-hide-chrome` /
    `.slip-hide-data` sınıfları (global, `@media print` dışı) ile — [index.css](apps/web/src/index.css).
    `color:transparent` görseli gizlemez → `.slip-hide-chrome .slip-chrome img { visibility:hidden }` ayrıca var.
  - **Yerleşim: A5 yatay sabit** (`@page A5 landscape`). Yerleşim seçici (A5/A4-2'li) UI'dan **kaldırıldı**
    (dot-matrix sürekli form akışında A4-2'li kesme gereksizdi). Form gövdesi tek `SlipForm` bileşeni.
    (`.slip-a4`/`.slip-copy`/`.slip-cut` CSS'i index.css'ten de kaldırıldı — a4x2 istenirse sıfırdan yazılmalı.)
  - **`FORM_ROWS = 5`** — matbu formun SABİT mal satırı sayısı. Master (`blank`) fişten bağımsız; koşullu
    render YASAK (tutar/KDV satırı her modda basılır, içi boşken `&nbsp;`) — geometri veriye bağlı olursa
    matbu forma hizalama kayar. `FieldLine` sabit yükseklik (`lines`), yalnız **son alan** `auto` (ADRESİ).
  - **Nüsha etiketi** (3 nüshalı karbonlu koçan; dot-matrix baskı): modalda **Nüsha** seçici
    (`SLIP_COPIES`: yok/1·Alıcı/2·Taşıyıcı/3·Dosya; asıl=alıcıya, orta=taşıyıcıda, dip=bizde) →
    başlık sağ üstte `copyBadge` rozeti basar. Rozet **chrome**
    (matbu) olduğundan `blank` master'da görünür, `data` (günlük) baskıda gizli. Matbaa master'ı: `blank` modda
    nüshayı sırayla seçip 3 ayrı PDF çıkar → matbaaya ver (her nüsha ayrı renkli kağıda).
  - **QR = fişi açan link** (`${origin}/mal-kabul/${receipt.id}`; okutunca mal kabul kaydı açılır — data). **Marka:**
    fiş başında **logo** (`apps/web/public/logo.png`, yoksa gizlenir) + firma adı/slogan; altta **iletişim şeridi**
    (tel/e-posta/adres/web). Firma bilgileri [lib/company.ts](apps/web/src/lib/company.ts) `COMPANY` sabitinden.
- Palet bazlı **kısmi sevk** desteklenir. Sevkiyatta QR okut: tek palet ya da "girişin tümü";
  "Hepsini Ekle"; "Bu araca planlı (N)".
- **Planlanan araç:** ASN.vehicleId stok ve sevkiyat paletlerine taşınır (operatör hangi yükün
  hangi araca gideceğini görür). Depo kartında rozet. `PATCH /asn/:id/vehicle` ile plan değiştirilebilir
  (iptal hariç her durumda; ön ihbar detayından — yönetici/şef).
- **Depo = YÜK PLANLAMA ekranı** ([StockPage](apps/web/src/pages/StockPage.tsx)): **önce üstteki araç
  şeridinden ARAÇ seçilir** — seçilmeden kartlarda "Bu kabulü … aracına yükle" kutusu ÇIKMAZ (araçsız
  seçim yok; araç bırakılınca seçim temizlenir). Seçim kabul bazında (tamamı). Altta sabit çubuk →
  **"PLAKA aracına yükle"**: o aracın **taslak seferine ekler**, yoksa yenisini açar (`POST /dispatches` +
  `POST /:id/items`) ve sayfada kalır. (Eski araç/taslak soran `LoadToVehicleModal` kaldırıldı.)
  Böylece **farklı müşterilerin malı tek sevkiyatta** toplanır → tek taşıma
  irsaliyesinde hepsi görünür (173 GT'nin istediği liste yapısı).
- **Hızlı Sevk** (kartın altındaki ikincil "Sevk Et") →
  `POST /dispatches/quick`. **Tek kabulü ayrı sefer olarak ANINDA sevk eder** — çoklu müşteri
  planlamak isteyen kullanıcı bunu kullanırsa her kabul ayrı irsaliye olur; bu yüzden modalda
  uyarı var ve buton ikincil stilde.
- Sevkiyat detayında yeşil/turuncu araç eşleştirmesi YALNIZCA taslakta yük ekleme listesinde
  (yüklenmiş/sevk edilmiş yüklerde gösterilmez — yanıltıcıydı).
- **Sevk edilmiş sevkiyatta düzeltme:** "🚚 Aracı Değiştir" (`PATCH /dispatches/:id/vehicle`; yanlış plaka)
  ve "↩ Sevkiyatı Geri Al" (`cancel`; paletler **ve** paletsiz kabuller depoya döner, durak ataması düşer).

### Kalem bazlı sevk — `DispatchItem` defteri

**`DispatchItem` = "araçta ne var" sorusunun TEK kaynağı.** `Package.dispatchId` bu defterin
**aynası** (QR okutma akışı için korunur), `Receipt.dispatchId` **DORMANT** (yazılmaz).

- **Tek-granülerlik kuralı:** bir kabulün **paleti varsa KAP** bazlı (palet seçilir), **yoksa KALEM**
  bazlı (ürün + miktar, kısmi sevk). Karışık kullanım çift sayım yapardı → serviste reddedilir
  (`loadItems`: paletli kabulde kalem yüklenemez). Paletler kalemlere bağlı olmadığı için
  "5 paletin 3'ü kaç adet?" sorusu hiç sorulmaz.
- **Kalan stok:** `ReceiptLine.dispatchedQty` sayacı (defterle **aynı transaction'da** güncellenir);
  `kalan = countedQty - dispatchedQty`. `findStock` bunu Prisma **alan-referansı** ile tek sorguda
  filtreler (kod tabanında ham SQL yok, öyle kalsın).
- **Tek yazma hunisi:** `loadItems`/`unloadItems` ([dispatch.service.ts](apps/api/src/dispatch/dispatch.service.ts)).
  `addPackage`, `addPackages`, `quickDispatch`, `addItems`, `removeItem`, `cancel` hepsi buradan geçer —
  başka yerde `package.updateMany({dispatchId})` YAZMAYIN.
- **İyimser kilit:** `updateMany({ where: { id, dispatchedQty: okunan }, ... })` → `count===0` ise
  "kalem az önce değişti" hatası (iki operatör aynı kalemi yükleyemez).
- **İptal:** defter satırları **silinir** (sayaç düşer, palet depoya döner); silinen içerik
  `AuditEvent.metadata`'ya yazılır. Böylece stok sorguları `status != CANCELLED` filtresi taşımaz.
- **Geri açma:** `reopen` defterde satırı olan kabulü reddeder (yoksa `countedQty` düşürülüp sayaç bozulur).
- API: `POST /dispatches/:id/items` (`[{packageId | receiptLineId+qty, stopId?}]`),
  `DELETE /dispatches/:id/items/:itemId`. UI: "**+ Depodan Yük Ekle**" modalı
  ([DispatchDetailPage](apps/web/src/pages/DispatchDetailPage.tsx)) — paletli kabulde checkbox,
  paletsizde `− [miktar] +` (max = kalan).

### Çok duraklı sevkiyat + Taşıma İrsaliyesi (VUK 240/A)

Bir sefer (Dispatch) = bir araç = **bir taşıma irsaliyesi**. Sefer içinde farklı göndericilerin yükü
farklı alıcılara/noktalara gidebilir.

- **`DispatchStop`** = sıralı teslimat noktası (`seq`). Alıcı opsiyonel kayıtlı `Customer` +
  `CustomerLocation`; ad/adres/telefon **snapshot**'lanır (ASN `validateRecipients` deseni) ki kayıt
  sonradan değişse belge sabit kalsın. `deliveredAt` ile durak teslim işaretlenir.
  **Rota sırası UI'dan ▲▼ ile değiştirilir** (`PATCH /:id/stops/reorder`; dokunmatikte sürükle-bırak
  yerine ok — telefonda güvenilir). Duraklar **OPSİYONEL**: alıcı ön ihbardan geldiği için irsaliye
  duraksız da doğru basılır; durak rota sırası/teslim takibi ve ekstra nokta için.
- **⚠ ALICI = FİRMA, nokta adı DEĞİL.** `DispatchStop.name` teslim NOKTASININ adı olabilir
  (ör. "Gökbil Depo" — bu Arkem'in bir lokasyonu). İrsaliyedeki "kime gönderildiği" (VUK 209)
  firma unvanı olmalı → `recipientOf()` sırası: **durağın `customerName`** → ön ihbardaki alıcı
  (`item.recipientName`) → en son çare durak adı. `stops` include'ında `customer:{name}` bu yüzden var.
  Durak varsa ada **`{seq}. ` öneki** eklenir (şoför rota sırasını belgeden okusun; ayrı sütun açmak
  matbu form genişliğini bozardı). Ad boşsa önek de eklenmez — "ALICI boş" uyarısı çalışmaya devam etsin.
- **Sıra tek yerden yönetilir:** Duraklar kartındaki ▲▼. Liste (`sortByStop`), rota ve irsaliye
  hep aynı sırayı gösterir. "Yüklenen Yük" kartı rota editörü DEĞİL — yükleme manifestosudur.
- **Durak etiketi = `stopLabel()` → "YER — FİRMA".** Ekranda yer önce (operatörün sorusu "nereye"),
  firma da yazılır çünkü **aynı firmanın birden çok lokasyonu olabilir** (Arkem'in "Gökbil Depo" ve
  "Yusufoğlu Depo"su) — yalnız firma yazınca iki durak ayırt edilemiyordu. Belgede ALICI olarak
  yasal gereklilikten yalnız FİRMA basılır. `stopLabel` yer==firma ise tekrar etmez.
- **Yanlış atama uyarısı:** `isMismatched()` — yükün durağının `customerName`'i ile ön ihbardaki
  `recipientName` farklıysa seçici amber olur + kart başında uyarı (irsaliyede yanlış ALICI basılmasını
  önler). **"Yükleri Yeniden Ata"** tüm atamaları sıfırlayıp `suggest`'i yeniden çalıştırır.
- **Yük → durak ataması:** `Package.stopId` (paletli), `Receipt.stopId` (paletsiz). Sevkiyat detayında
  her paletin yanında durak seçici. `PATCH /dispatches/:id/stops/:stopId/assign`
  (**`stopId='yok'` → atamayı kaldırır**).
- **`POST /:id/stops/suggest`** — kritik UX: sevkiyattaki kabullerin ön ihbar alıcılarından
  (`shipment.recipientCustomer` + `recipients`) durakları otomatik türetir ve **yalnızca atanmamış**
  yükleri bağlar (elle yapılan atamayı ezmez). Durakları ada göre yeniden kullanır.
- **Belge:** [WaybillForm.tsx](apps/web/src/components/print/WaybillForm.tsx) — **A4 DİKEY**,
  `WAYBILL_ROWS = 8`. Sütunlar klasik parsiyel ambar düzeninde: `TESELLÜM MAKBUZ NO · ADET · NEVİ ·
  KİLO · MALIN CİNSİ · GÖNDERENİN ADI SOYADI · ALICININ ADI SOYADI · SEVK İRS. NO · TUTARI U/A · TUTARI P/O`
  (NEVİ kalemin kap tipinden basılır; KİLO/TUTAR matbu formda elle doldurulur). Satırlar **defterden** üretilir: kap satırı = durak × kabul ×
  kap tipi, **kalem satırı = her ürün ayrı** (artık "Muhtelif" yok). Durağa atanmamış yükler sonda
  **"ATANMAMIŞ"** grubunda + ekranda uyarı.
  - **173 GT dayanağı:** birden fazla kişinin malı tek araçtaysa gönderici/alıcı adlarının **ayrı
    sütunlarda** olduğu **liste şeklinde TEK** taşıma irsaliyesi düzenlenir; listeye **tesellüm fişi
    örnekleri + göndericilerin sevk irsaliyeleri** eklenir (bu yüzden SEVK İRS. NO sütunu var).
  - **EK LİSTE:** 8 satırı aşan yükler ikinci sayfaya ("TAŞIMA İRSALİYESİ EKİ — YÜK LİSTESİ", düz kağıt,
    aynı seri/sıra no'ya atıfla) basılır. Matbu form 8 satır kalır.
- **Nüsha etiketleri tesellüm fişinden FARKLI** (VUK): ①GÖNDERİCİ (eşyayı taşıttıran) ②ARAÇTA (sürücü)
  ③DOSYA (bizde saklanır).
- **Taşıma ücreti varsayılanı `DEFAULT_FREIGHT_AMOUNT = 1` ₺ (KDV dahil → belgede GEN. TOP tam 1,00)**
  ([shared/schemas/dispatch.ts](packages/shared/src/schemas/dispatch.ts)). Ücret VUK'ta zorunlu alan,
  boş bırakılamıyor; firma aynı araçta çok müşterinin yükü olduğu için sefer tutarının belgeye
  basılmasını istemedi (herkes herkesin navlununu görüyordu). **TEK DEĞER kuralı:** belgeye ne
  basılıyorsa kayıtta duran odur — arka planda ayrı bir "gerçek tutar" SAKLANMAZ. Gerçek ücret
  gerektiğinde irsaliye bilgileri modalından yazılır. (Gizliliği asıl çözecek yol gönderici başına
  ayrı irsaliye basmaktır — önerildi, kullanıcı varsayılan tutarı tercih etti.)
- **Seri/sıra no'yu ANLAŞMALI MATBAA basar** — uygulama üretmez. Operatör eldeki matbu formun numarasını
  girer (`waybillSerial`/`waybillNo`, `@@unique` ile mükerrer engellenir); `PATCH /dispatches/:id/waybill`
  ayrıca `waybillDate` + `freightAmount`/`freightVatIncluded` (taşıma ücreti VUK'ta zorunlu alan).
- `COMPANY.taxOffice`/`taxNumber` **irsaliyede zorunlu** — boşsa belgede uyarı çıkar.

## Tasarım sistemi (UI)

- **Panel düzeni** ([AppLayout.tsx](apps/web/src/components/AppLayout.tsx)): masaüstünde solda sabit
  sidebar (gruplu menü + alt kullanıcı kartı), sağda içerik. **Mobilde**: üstte hamburger + başlık,
  soldan kayan çekmece (aynı sidebar), altta tab bar (5 ana bölüm) — native app hissi.
- **İkonlar:** emoji DEĞİL, çizgi-ikon seti [icons.tsx](apps/web/src/components/icons.tsx) (`<Icon name=.../>`, currentColor).
- **Card** ([ui.tsx](apps/web/src/components/ui.tsx)): `rounded-md` (6px), yumuşak gölge.
- **Ekleme/düzenleme formu listeyle aynı yüzeyde AÇILMAZ** — `Modal` ([ui.tsx](apps/web/src/components/ui.tsx))
  ile açılır (masaüstünde ortada, mobilde alttan kayan sayfa; Esc/×/arka plan tıklaması kapatır).
  `+ Yeni` → `adding` state; satırdaki `Düzenle` → `editing: T | null` state (state listede/sayfada tutulur,
  satır yalnızca `onEdit` alır). Form bileşenleri `onDone` + `onCancel` alır, kendi `Card`'ını sarmalamaz.
  Uygulanan yerler: Araçlar, Müşteriler(+detay: firma/yetkili/lokasyon), Depolar, Kullanıcılar.
- **Liste aralığı:** kart listelerinde `flex flex-col gap-4` kullan — `space-y-*` KULLANMA:
  kartlar `<Link>` (inline `<a>`) ile sarılı olduğundan üst-margin çalışmaz, kartlar yapışır. `gap` her zaman çalışır.
- Plaka girişleri `PlateInput` ile maskelenir (34 GTY 70 / 34 L 3393 vb.).
- **Telefon girişleri `PhoneInput`** ile maskelenir: `0XXX XXX XX XX` (4-3-2-2, baştaki 0 zorunlu —
  0'sız yazılırsa/yapıştırılırsa eklenir, +90/0090 ülke kodu temizlenir; [lib/phone.ts](apps/web/src/lib/phone.ts)).
  react-hook-form'da `Controller` ile bağlanır (register ile değil). Uygulandığı yerler: müşteri, yetkili,
  lokasyon, araç şoförü.
- **Para girişleri `MoneyInput`** ile maskelenir: `1.250,50` ([lib/money.ts](apps/web/src/lib/money.ts)).
  **`<input type="number">` binlik ayracı GÖSTEREMEZ** (HTML standardı; değer daima `1250.5` gibi ham
  durur) — bu yüzden metin input + maske. Dışarıya **sayı** verir, şemadaki `z.coerce.number()`
  değişmeden çalışır; `Controller` ile bağlanır. Görünen metin ile değer ayrı tutulur (yazarken
  "1250," virgülü silinmesin diye); dışarıdan gelen değer değişirse metin tazelenir (`emitted` ref).
  Uygulandığı yerler: ön ihbar birim fiyat, irsaliye taşıma ücreti.

## Veritabanı / Prisma kuralları

- **Migration:** eklemeli (additive) değişiklik → `prisma migrate dev`. Yıkıcı/veri-kaybı →
  elle `migration.sql` + `prisma migrate deploy` (non-interactive ortamda `migrate dev` bloklanır).
- **Client üretimi EPERM:** `prisma generate` çalışan `pnpm dev` node süreçleri motor DLL'ini kilitler.
  Çözüm: önce node'u durdur (`Stop-Process -Name node -Force`), `pnpm prisma generate`, sonra tekrar `pnpm dev`.
- **Müşteri silme:** Geçmişi olan müşteri **SİLİNEMEZ** (409) — fiş/irsaliye müşteri bilgisini (ünvan,
  VD/VKN, adres) **canlı okur**, snapshot yok; ayrıca VUK belge saklama. `GET /customers/:id/usage`
  sayar (gönderici/alıcı ön ihbar, mal kabul, sevkiyat durağı); UI buna göre **Sil** ya da
  **Pasife Al** gösterir. `Customer.isActive=false` → listede/seçimde görünmez, belgeler sağlam.
  Hiç kullanılmamış müşteri gerçekten silinir (yanlış açılan kayıt; alt kayıtlar cascade gider).
- **Alıcı = kayıtlı Müşteri:** Ön ihbarda gönderici (customerId) ve alıcı (recipientCustomerId) ikisi de Customer;
  her birinin `CustomerLocation`'ları yükleme/teslim yeridir. `CustomerRecipient` dormant (kullanılmıyor).
  Müşteride `taxOffice`/`taxNumber` + çoklu `CustomerContact` (ad/görev/tel/e-posta/dahili). **Fişte GÖNDEREN/ALICI
  = firma bilgileri** (ünvan, vergi dairesi/no, adres, tel); yükleme/teslim nokta listeleri kaldırıldı.
- **Modeller:** User, Customer(+taxOffice,taxNumber), CustomerContact, CustomerLocation, CustomerRecipient(dormant),
  Warehouse(+isDefault), Location,
  InboundShipment(+vehicleId,recipientCustomerId,sources,recipients), ShipmentLine, ShipmentSource, ShipmentRecipient,
  Receipt(+waybillNo, orderNo, dispatchId, **stopId**, attachments), ReceiptLine, Package(+dispatchId,
  dispatchedAt, **stopId**), Discrepancy, Attachment(discrepancyId? **veya** receiptId?),
  Dispatch(+vehicleId, packages, **stops, waybillSerial/waybillNo/waybillDate, freightAmount, freightVatIncluded**),
  **DispatchStop**(dispatchId, seq, customerId?, customerLocationId?, name/address/phone snapshot, deliveredAt),
  Vehicle(type=String), AuditEvent, **Region**(name unique, sortOrder, isActive),
  **PickupTask**(status OPEN/RECEIVED/CANCELLED, customerId, vehicleId, regionId?, recipientCustomerId?,
  receiptId? unique). Receipt(+**regionId, storedRegionId**).
- **Şema ↔ elle yazılmış migration:** `ShipmentSource`/`ReceiptSource.warehouse` ilişkileri
  `onDelete: Restrict` — elle yazılan migration'larla aynı olsun diye şemaya eklendi; eksikken her
  `migrate dev` bu FK'leri SET NULL'a çevirmeye çalışıyordu. Yeni migration üretince SQL'de beklenmedik
  DROP/ALTER var mı mutlaka bak (`--create-only`).

## Doğrulama (değişiklik sonrası)

- Web: `cd apps/web && npx tsc --noEmit`. API: `cd apps/api && npx tsc --noEmit`. shared: build.
- Sadece web (CSS/TSX) değiştiyse Vite HMR yeniler, restart gerekmez. API/shared değiştiyse `pnpm dev`'i yeniden başlat.

## Tuzaklar / workaround'lar

- **Test girişi:** Kullanıcı admin şifresini DEĞİŞTİRDİ (admin123 çalışmaz). Test için geçici admin
  ekle (psql), bitince sil. e-posta zod-geçerli olmalı (örn. `tmpadmin@test.com`), şifre bcrypt hash'li.
- **PowerShell** PascalCase tablo adlarını `psql -c` ile bozar → SQL'i dosyaya yazıp `psql -f` kullan.
  Geçici dosya temizliğinde `Remove-Item` ara sıra bloklanır → Bash `rm` kullan.
- **Telefon kamerası** HTTPS ister (cloudflared tüneli). Kamera siyah ekran sorunu StrictMode çift-mount
  kaynaklıydı; BarcodeScanner deferred start (setTimeout) + yüksek çözünürlük ile çözüldü.

## Güvenlik yapılacaklar

- `apps/api/.env` içine bir kez gerçek **ANTHROPIC_API_KEY** yapıştırılmıştı → artık kullanılmıyor,
  Anthropic panelinden **iptal edilmeli** (ve yerel `.env`'lerden silinmeli).
- Varsayılan demo şifreleri (operator123 vb.) prod kullanımda değiştirilmeli.

## Bekleyen / sonraki

- "Kalıcı kurulum": Postgres'in Windows açılışında oto-başlaması + kalıcı adres/HTTPS (kullanıcı "sonra" dedi).
- İstenirse: aynı araca planlı çok kartı tek sevkiyatta birleştirme; sayfa içi emoji'leri çizgi-ikona geçirme.

---
**Bu dosyayı güncel tut:** Mimari/akış kararı değiştikçe ilgili satırı güncelle. Detaylı, kalıcı
notlar için `.claude/.../memory/` (MEMORY.md indeksli) kullanılır; bu CLAUDE.md ise her oturumda yüklenen özet bağlamdır.
