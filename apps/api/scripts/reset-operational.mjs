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

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const name of ['.env.reset', '.env']) {
    const p = join(here, '..', name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/);
      // placeholder'ı (HOST/PAROLA) atla
      if (m && m[1] && !/HOST|PAROLA|KULLANICI|buraya/i.test(m[1])) return m[1];
    }
  }
  return '';
}

const url = loadDatabaseUrl();
if (!url) {
  console.error(
    'HATA: DATABASE_URL bulunamadı.\n' +
      'Bulutu sıfırlamak için apps/api/.env.reset dosyasına Supabase adresinizi koyun\n' +
      '(apps/api/.env.reset.example dosyasını .env.reset olarak kopyalayıp doldurun).',
  );
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error('Bu script veri SİLER. Onay için --yes ile çalıştırın (ya da SIFIRLA.bat kullanın).');
  process.exit(1);
}

process.env.DATABASE_URL = url;
const redacted = url.replace(/\/\/[^@]*@/, '//***:***@');
const prisma = new PrismaClient();

async function main() {
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
