-- Akış ön ihbardan mal kabule taşındı.
--
-- Gerçek operasyonda malın geleceği önceden bilinmiyor: araç depoya gelir,
-- irsaliyesini getirir, depocu kontrol edip indirir. İşi depocu başlatıyor.
-- Ticari/taraf bilgileri bugüne kadar YALNIZ InboundShipment'ta duruyordu, bu
-- yüzden ön ihbarsız ("kör") kabullerde alıcı boş kalıyor ve taşıma
-- irsaliyesinde ALICI sütunu boş basılıyordu (VUK 209'da zorunlu alan).
--
-- Bu migration YIKICI DEĞİLDİR: veriyi Receipt'e KOPYALAR, InboundShipment
-- satırları yerinde kalır. Yanlış giderse yeniden koşturulabilir.

-- 1) Receipt'e ticari/taraf kolonları (hepsi nullable ya da varsayılanlı)
ALTER TABLE "Receipt" ADD COLUMN "recipientCustomerId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "plannedVehicleId"    TEXT;
ALTER TABLE "Receipt" ADD COLUMN "deliveryBy"          TIMESTAMP(3);
ALTER TABLE "Receipt" ADD COLUMN "currency"            TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "Receipt" ADD COLUMN "paymentType"         TEXT;
ALTER TABLE "Receipt" ADD COLUMN "showAmountOnSlip"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Receipt" ADD COLUMN "vatIncluded"         BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_recipientCustomerId_fkey"
  FOREIGN KEY ("recipientCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt"
  ADD CONSTRAINT "Receipt_plannedVehicleId_fkey"
  FOREIGN KEY ("plannedVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Receipt_recipientCustomerId_idx" ON "Receipt"("recipientCustomerId");
CREATE INDEX "Receipt_plannedVehicleId_idx" ON "Receipt"("plannedVehicleId");

-- 2) Yükleme/boşaltma yeri tabloları (ShipmentSource/ShipmentRecipient aynası)
CREATE TABLE "ReceiptSource" (
  "id"                 TEXT NOT NULL,
  "receiptId"          TEXT NOT NULL,
  "customerLocationId" TEXT,
  "warehouseId"        TEXT,
  "label"              TEXT NOT NULL,
  "address"            TEXT,
  CONSTRAINT "ReceiptSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceiptRecipient" (
  "id"                 TEXT NOT NULL,
  "receiptId"          TEXT NOT NULL,
  "customerLocationId" TEXT,
  "label"              TEXT NOT NULL,
  "address"            TEXT,
  CONSTRAINT "ReceiptRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReceiptSource_receiptId_idx" ON "ReceiptSource"("receiptId");
CREATE INDEX "ReceiptRecipient_receiptId_idx" ON "ReceiptRecipient"("receiptId");

ALTER TABLE "ReceiptSource"
  ADD CONSTRAINT "ReceiptSource_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptSource"
  ADD CONSTRAINT "ReceiptSource_customerLocationId_fkey"
  FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceiptSource"
  ADD CONSTRAINT "ReceiptSource_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceiptRecipient"
  ADD CONSTRAINT "ReceiptRecipient_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceiptRecipient"
  ADD CONSTRAINT "ReceiptRecipient_customerLocationId_fkey"
  FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) VERİ TAŞIMA — mevcut kabullerin fiş bilgileri ön ihbardan kopyalanır.
--    Bu adım atlanırsa eski tesellüm fişleri boş basılır.
UPDATE "Receipt" r SET
  "recipientCustomerId" = s."recipientCustomerId",
  "plannedVehicleId"    = s."vehicleId",
  "deliveryBy"          = s."deliveryBy",
  "currency"            = s."currency",
  "paymentType"         = s."paymentType",
  "showAmountOnSlip"    = s."showAmountOnSlip",
  "vatIncluded"         = s."vatIncluded"
FROM "InboundShipment" s
WHERE r."shipmentId" = s."id";

-- Yükleme yerleri. Bir ön ihbardan birden çok kabul açılmış olabilir; her
-- kabul kendi kopyasını alır. id: kaynak id + kabul id'sinden türetilir ki
-- migration yeniden koşarsa mükerrer satır üretmesin.
INSERT INTO "ReceiptSource" ("id", "receiptId", "customerLocationId", "warehouseId", "label", "address")
SELECT md5(ss."id" || r."id"), r."id", ss."customerLocationId", ss."warehouseId", ss."label", ss."address"
FROM "ShipmentSource" ss
JOIN "Receipt" r ON r."shipmentId" = ss."shipmentId"
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ReceiptRecipient" ("id", "receiptId", "customerLocationId", "label", "address")
SELECT md5(sr."id" || r."id"), r."id", sr."customerLocationId", sr."label", sr."address"
FROM "ShipmentRecipient" sr
JOIN "Receipt" r ON r."shipmentId" = sr."shipmentId"
ON CONFLICT ("id") DO NOTHING;
