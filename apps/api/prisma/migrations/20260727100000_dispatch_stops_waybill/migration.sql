-- Çok duraklı sevkiyat + Taşıma İrsaliyesi (VUK 240/A) — tamamı additive

-- Sevkiyata taşıma irsaliyesi alanları (matbu belgenin seri/sıra no'su elle girilir)
ALTER TABLE "Dispatch" ADD COLUMN "waybillSerial" TEXT;
ALTER TABLE "Dispatch" ADD COLUMN "waybillNo" TEXT;
ALTER TABLE "Dispatch" ADD COLUMN "waybillDate" TIMESTAMP(3);
ALTER TABLE "Dispatch" ADD COLUMN "freightAmount" DECIMAL(12,2);
ALTER TABLE "Dispatch" ADD COLUMN "freightVatIncluded" BOOLEAN NOT NULL DEFAULT false;

-- Aynı yasal belge iki kez girilmesin (Postgres NULL'ları ayrık sayar → boş kayıtlar serbest)
CREATE UNIQUE INDEX "Dispatch_waybillSerial_waybillNo_key" ON "Dispatch"("waybillSerial", "waybillNo");

-- Teslimat noktası (durak)
CREATE TABLE "DispatchStop" (
    "id" TEXT NOT NULL,
    "dispatchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerLocationId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchStop_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DispatchStop_dispatchId_idx" ON "DispatchStop"("dispatchId");

ALTER TABLE "DispatchStop" ADD CONSTRAINT "DispatchStop_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatchStop" ADD CONSTRAINT "DispatchStop_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatchStop" ADD CONSTRAINT "DispatchStop_customerLocationId_fkey"
    FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Palet ve (paletsiz) kabul → durak ataması
ALTER TABLE "Package" ADD COLUMN "stopId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "stopId" TEXT;

CREATE INDEX "Package_stopId_idx" ON "Package"("stopId");
CREATE INDEX "Receipt_stopId_idx" ON "Receipt"("stopId");

ALTER TABLE "Package" ADD CONSTRAINT "Package_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "DispatchStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_stopId_fkey"
    FOREIGN KEY ("stopId") REFERENCES "DispatchStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
