// Mevcut kayıtlardaki serbest metin alanlarını BÜYÜK HARFE çevirir (Türkçe: i→İ, ı→I).
//
// Neden: kullanıcılar aynı bilgiyi farklı yazıyordu ("arkem kimya" / "Arkem Kimya"), belgelerde
// ve listelerde tutarsız görünüyordu. Artık YENİ kayıtlar shared zod şemalarında
// (packages/shared/src/text.ts `upperStr`/`upperOpt`) yazma anında normalize ediliyor;
// bu script ESKİ kayıtları aynı hâle getirir. Bir kez çalıştırılması yeterlidir.
//
// DOKUNULMAYANLAR (bilinçli): e-posta, şifre, telefon, vergi no, id/referans/QR kodları,
// tarih ve sayısal alanlar.
//
// Hedef veritabanı: apps/api/.env.reset (varsa — BULUT/Supabase) yoksa apps/api/.env (yerel).
// Çalıştırma: BUYUKHARF.bat  (ya da:  node apps/api/scripts/uppercase-text.mjs --yes)
// Önce YEDEKLE.bat ile yedek alın.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));

function readDbUrl(path) {
  if (!existsSync(path)) return null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/);
    if (m) return m[1] ?? '';
  }
  return '';
}
const isPlaceholder = (u) => !u || /HOST|PAROLA|KULLANICI|buraya/i.test(u);

/** reset-operational.mjs ile AYNI öncelik: .env.reset (BULUT) > ortam > .env (yerel). */
function loadDatabaseUrl() {
  const resetPath = join(here, '..', '.env.reset');
  if (existsSync(resetPath)) {
    const u = readDbUrl(resetPath);
    if (isPlaceholder(u)) {
      return {
        error:
          'apps/api/.env.reset dosyasındaki DATABASE_URL doldurulmamış (hâlâ şablon).\n' +
          'Render > servisin > Environment > DATABASE_URL değerini kopyalayıp\n' +
          '.env.reset içine  DATABASE_URL="..."  olarak yapıştırın.',
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
if (!process.argv.includes('--yes')) {
  console.error('Bu script kayıtları DEĞİŞTİRİR. Onay için --yes ile çalıştırın.');
  process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');

process.env.DATABASE_URL = res.url;
const prisma = new PrismaClient();

/** Türkçe büyük harf — shared/text.ts `trUpper` ile aynı kural. */
const up = (s) => s.toLocaleUpperCase('tr-TR');
/** Kod/slug alanları ASCII kalmalı (regex `[A-Za-z0-9_-]`). */
const upAscii = (s) => s.toUpperCase();

/**
 * Hangi tablonun hangi alanları çevrilecek.
 * `ascii: true` → kod/slug alanı (İ üretmemeli).
 */
const TARGETS = [
  { model: 'customer', fields: ['name', 'contactName', 'address', 'taxOffice'], ascii: ['code'] },
  { model: 'customerContact', fields: ['name', 'role'] },
  { model: 'customerLocation', fields: ['name', 'address'] },
  { model: 'customerRecipient', fields: ['name', 'address'] },
  { model: 'warehouse', fields: ['name', 'address'], ascii: ['code'] },
  { model: 'location', fields: ['description'], ascii: ['code'] },
  { model: 'user', fields: ['fullName'] },
  { model: 'vehicle', fields: ['plate', 'type', 'driverName', 'trailerPlate'] },
  { model: 'inboundShipment', fields: ['notes', 'loadAddress', 'deliveryAddress'] },
  { model: 'shipmentLine', fields: ['sku', 'description'] },
  { model: 'shipmentSource', fields: ['label'] },
  { model: 'shipmentRecipient', fields: ['label', 'address'] },
  { model: 'receipt', fields: ['notes'], ascii: ['waybillNo', 'orderNo'] },
  { model: 'receiptLine', fields: ['sku', 'description'] },
  { model: 'package', fields: ['sku', 'note'] },
  { model: 'discrepancy', fields: ['description'] },
  { model: 'dispatch', fields: ['destination', 'vehiclePlate', 'driverName', 'notes'], ascii: ['waybillSerial', 'waybillNo'] },
  { model: 'dispatchStop', fields: ['name', 'address', 'note'] },
  { model: 'dispatchItem', fields: ['description'] },
];

async function main() {
  console.log('Kaynak   :', res.source);
  console.log('Hedef DB :', res.url.replace(/\/\/[^@]*@/, '//***:***@'));
  if (dryRun) console.log('MOD      : DENEME (--dry-run) — hiçbir kayıt yazılmayacak\n');
  else console.log('MOD      : YAZMA\n');

  let totalRows = 0;
  for (const t of TARGETS) {
    const delegate = prisma[t.model];
    if (!delegate) {
      console.warn(`! ${t.model}: model bulunamadı, atlandı`);
      continue;
    }
    const textFields = t.fields ?? [];
    const asciiFields = t.ascii ?? [];
    const select = { id: true };
    for (const f of [...textFields, ...asciiFields]) select[f] = true;

    const rows = await delegate.findMany({ select });
    let changed = 0;
    for (const row of rows) {
      const data = {};
      for (const f of textFields) {
        const v = row[f];
        if (typeof v === 'string' && v !== up(v)) data[f] = up(v);
      }
      for (const f of asciiFields) {
        const v = row[f];
        if (typeof v === 'string' && v !== upAscii(v)) data[f] = upAscii(v);
      }
      if (Object.keys(data).length === 0) continue;
      changed++;
      if (!dryRun) await delegate.update({ where: { id: row.id }, data });
    }
    totalRows += changed;
    const mark = changed ? '✓' : '·';
    console.log(`${mark} ${t.model.padEnd(18)} ${String(changed).padStart(5)} / ${rows.length} kayıt`);
  }

  console.log(`\nToplam ${totalRows} kayıt ${dryRun ? 'değişecekti' : 'güncellendi'}.`);
}

main()
  .catch((e) => {
    console.error('HATA:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
