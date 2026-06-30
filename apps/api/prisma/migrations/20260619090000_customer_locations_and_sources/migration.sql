-- CreateTable
CREATE TABLE "CustomerLocation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentSource" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "customerLocationId" TEXT,
    "label" TEXT NOT NULL,

    CONSTRAINT "ShipmentSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLocation_customerId_idx" ON "CustomerLocation"("customerId");

-- CreateIndex
CREATE INDEX "ShipmentSource_shipmentId_idx" ON "ShipmentSource"("shipmentId");

-- AlterTable
ALTER TABLE "InboundShipment" DROP COLUMN "sourceLocation";

-- AddForeignKey
ALTER TABLE "CustomerLocation" ADD CONSTRAINT "CustomerLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentSource" ADD CONSTRAINT "ShipmentSource_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "InboundShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentSource" ADD CONSTRAINT "ShipmentSource_customerLocationId_fkey" FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
