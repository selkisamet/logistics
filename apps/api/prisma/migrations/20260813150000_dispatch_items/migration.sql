-- Kalem bazlı sevk: DispatchItem = sevkiyattaki yükün TEK defteri.
-- Package.dispatchId bu defterin AYNASI olarak korunur (QR okutma akışı + eski kayıtlar).
-- Receipt.dispatchId artık DORMANT (yazılmaz; backfill'den sonra okunmaz).
--
-- NOT: Aşağıdaki CHECK kısıtı (receiptLineId XOR packageId) Prisma şemasında MODELLENEMEZ.
-- `prisma db pull` yapılırsa kaybolur — o durumda bu dosyadan geri eklenmeli.

-- 1) Kalem bazında sevk edilen toplam (depoda kalan = countedQty - dispatchedQty)
ALTER TABLE "ReceiptLine" ADD COLUMN "dispatchedQty" INTEGER NOT NULL DEFAULT 0;

-- 2) Sevkiyat defteri
CREATE TABLE "DispatchItem" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "stopId" TEXT,
    "receiptId" TEXT NOT NULL,
    "receiptLineId" TEXT,
    "packageId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'ADET',
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DispatchItem_packageId_key" ON "DispatchItem"("packageId");
CREATE INDEX "DispatchItem_dispatchId_idx" ON "DispatchItem"("dispatchId");
CREATE INDEX "DispatchItem_receiptId_idx" ON "DispatchItem"("receiptId");
CREATE INDEX "DispatchItem_receiptLineId_idx" ON "DispatchItem"("receiptLineId");
CREATE INDEX "DispatchItem_stopId_idx" ON "DispatchItem"("stopId");

ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "DispatchStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_receiptId_fkey"
    FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_receiptLineId_fkey"
    FOREIGN KEY ("receiptLineId") REFERENCES "ReceiptLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- XOR: kalem satırı ya da kap satırı — tam biri
ALTER TABLE "DispatchItem" ADD CONSTRAINT "DispatchItem_line_xor_package"
    CHECK (("receiptLineId" IS NOT NULL) <> ("packageId" IS NOT NULL));

-- 3) BACKFILL — kap (palet) yolu: sevkiyata bağlı her palet için bir defter satırı.
--    MALIN CİNSİ: kabulün tek kalemi varsa açıklaması, çoksa 'Muhtelif' (mevcut belge davranışı).
INSERT INTO "DispatchItem" ("id", "dispatchId", "stopId", "receiptId", "packageId", "qty", "unit", "description", "createdAt")
SELECT
    gen_random_uuid()::text,
    p."dispatchId",
    p."stopId",
    p."receiptId",
    p."id",
    1,
    p."type"::text,
    COALESCE(
      (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(rl."description") ELSE 'Muhtelif' END
       FROM "ReceiptLine" rl WHERE rl."receiptId" = p."receiptId"),
      ''
    ),
    p."createdAt"
FROM "Package" p
WHERE p."dispatchId" IS NOT NULL;

-- 4) BACKFILL — kabul (paletsiz) yolu: kabul düzeyinde sevk edilmiş kayıtların kalemleri.
INSERT INTO "DispatchItem" ("id", "dispatchId", "stopId", "receiptId", "receiptLineId", "qty", "unit", "description", "createdAt")
SELECT
    gen_random_uuid()::text,
    r."dispatchId",
    r."stopId",
    r."id",
    rl."id",
    rl."countedQty",
    rl."unit",
    rl."description",
    COALESCE(r."dispatchedAt", rl."createdAt")
FROM "Receipt" r
JOIN "ReceiptLine" rl ON rl."receiptId" = r."id"
WHERE r."dispatchId" IS NOT NULL AND rl."countedQty" > 0;

-- 5) Sayaç backfill: kalem bazlı defter satırlarının toplamı
UPDATE "ReceiptLine" rl
SET "dispatchedQty" = COALESCE(s."total", 0)
FROM (
    SELECT "receiptLineId", SUM("qty") AS "total"
    FROM "DispatchItem"
    WHERE "receiptLineId" IS NOT NULL
    GROUP BY "receiptLineId"
) s
WHERE rl."id" = s."receiptLineId";
