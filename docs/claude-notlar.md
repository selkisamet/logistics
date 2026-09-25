# Claude Code notları (taşınan hafıza)

Firma bilgisayarındaki Claude Code hafızasından (`~/.claude/projects/.../memory/`) taşındı.
Hafıza makineye bağlı olduğu için yeni makinede kaybolur; burada repoyla birlikte gelir.
Yeni makinede Claude'a: "CLAUDE.md ve docs/claude-notlar.md'yi oku" demek yeterli.

## Çalışma tercihi: kapsam dışına çıkma

Bir şey üzerinde çalışırken **komşu özelliği kendiliğinden değiştirme**, sadece bulguyu bildir.

19.08.2026: Taşıma irsaliyesine 1,00 ₺ varsayılan tutar eklerken tesellüm fişi de "opt-in" yapıldı.
Kullanıcı: *"Tesellüm fişine dokunmayacaktın, olduğu gibi kalacaktı. Çünkü orası zaten istediğim gibi
çalışıyordu."* Commit geri alındı (revert + yeniden deploy).

- **Neden:** Sistemin parçaları bilinçli ayarlanmış. "İlgili hata" sanılan şey çoğu zaman kasıtlı bir
  tercih; habersiz düzeltmek çalışan akışı bozuyor, geri almak bir deploy turu yakıyor.
- **Nasıl uygulanır:** Yan tarafta sorun görürsen kod değiştirme — bulguyu tek paragrafta anlat,
  "düzelteyim mi?" diye sor. İstenen kapsamın içindeki değişikliklerde serbestsin.

## Firma bilgisayarına özgü ortam notları (yalnız orada geçerli)

- Node PATH'te değildi (`C:\Program Files\nodejs`); pnpm `npm i -g pnpm@9` ile `%APPDATA%\npm`'e kuruldu.
- PostgreSQL **taşınabilir**: `.tools/pgsql`, veri `.tools/pgdata`, trust auth, port 5432, db `lojistik`,
  `pnpm pg:start` / `pnpm pg:stop`. `initdb` Türkçe locale yüzünden hata verdi → `--locale=C`.
- Proje klasörü taşınır/yeniden adlandırılırsa node_modules bozulur (pnpm mutlak yol linkleri).
  Onarım: node süreçlerini durdur → `pnpm install --config.confirmModulesPurge=false` (bayraksız
  arka planda "Proceed? (Y/n)" sorusunda takılır) → `cd apps/api && pnpm prisma generate`
  (pnpm 9 build script'lerini çalıştırmaz, Prisma client elle üretilir).

## Genel teknik notlar (her makinede geçerli)

- `packages/shared` çift derlenir (CJS + ESM) — bkz. CLAUDE.md.
- API'de global `ValidationPipe` yok; doğrulama zod + `ZodValidationPipe`.
