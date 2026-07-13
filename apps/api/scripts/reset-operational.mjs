// Operasyonel verileri sıfırlar: ÖN İHBAR + MAL KABUL + SEVKİYAT (ve palet/tutanak/log).
// KORUNANLAR: Müşteri (+lokasyon/yetkili/alıcı), Depo (+lokasyon), Araç, Kullanıcı.
//
// Hedef veritabanı: apps/api/.env.reset (varsa — BULUT/Supabase için) yoksa apps/api/.env (yerel).
// Çalıştırma: SIFIRLA.bat  (ya da:  node apps/api/scripts/reset-operational.mjs --yes)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));

function readDbUrl(path) {
  if (!existsSync(path)) return null; // dosya yok
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/);
    if (m) return m[1] ?? '';
  }
  return ''; // dosya var, anahtar yok
}
const isPlaceholder = (u) => !u || /HOST|PAROLA|KULLANICI|buraya/i.test(u);

/** Öncelik: apps/api/.env.reset (BULUT) > ortam DATABASE_URL > apps/api/.env (yerel).
 *  .env.reset ortam değişkenini de EZER (yanlışlıkla localhost'a bağlanmayı önler). */
function loadDatabaseUrl() {
  const resetPath = join(here, '..', '.env.reset');
  if (existsSync(resetPath)) {
    const u = readDbUrl(resetPath);
    if (isPlaceholder(u)) {
      return {
        error:
          'apps/api/.env.reset dosyasındaki DATABASE_URL doldurulmamış (hâlâ şablon).\n' +
          'Render > servisin > Environment > DATABASE_URL değerini AYNEN kopyalayıp\n' +
          '.env.reset içine  DATABASE_URL="..."  olarak yapıştırın, sonra tekrar deneyin.',
      };
    }
    return { url: u, source: '.env.reset' };
  }
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, source: 'ortam' };
  const u = readDbUrl(join(here, '..', '.env'));
  if (!u) return { error: 'DATABASE_URL bulunamadı (.env.reset veya .env).' };
  return { url: u, source: '.env' };
}

const res = loadDatabaseUrl();
if (res.error) {
  console.error('HATA:', res.error);
  process.exit(1);
}
const url = res.url;
const source = res.source;
if (!process.argv.includes('--yes')) {
  console.error('Bu script veri SİLER. Onay için --yes ile çalıştırın (ya da SIFIRLA.bat kullanın).');
  process.exit(1);
}

process.env.DATABASE_URL = url;
const redacted = url.replace(/\/\/[^@]*@/, '//***:***@');
const prisma = new PrismaClient();

async function main() {
  console.log('Kaynak   :', source);
  console.log('Hedef DB :', redacted);
  const before = {
    onIhbar: await prisma.inboundShipment.count(),
    malKabul: await prisma.receipt.count(),
    sevkiyat: await prisma.dispatch.count(),
    palet: await prisma.package.count(),
  };
  console.log('Silinecek:', before);

  // Çocuktan ebeveyne doğru (FK sırası). Tek transaction.
  await prisma.$transaction([
    prisma.attachment.deleteMany({}),
    prisma.discrepancy.deleteMany({}),
    prisma.package.deleteMany({}),
    prisma.receiptLine.deleteMany({}),
    prisma.receipt.deleteMany({}),
    prisma.dispatch.deleteMany({}),
    prisma.shipmentSource.deleteMany({}),
    prisma.shipmentRecipient.deleteMany({}),
    prisma.shipmentLine.deleteMany({}),
    prisma.inboundShipment.deleteMany({}),
    prisma.auditEvent.deleteMany({}),
  ]);

  console.log('✓ Ön ihbar, mal kabul, sevkiyat sıfırlandı. (Müşteri / depo / araç / kullanıcı korundu.)');
}

main()
  .catch((e) => {
    console.error('HATA:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
