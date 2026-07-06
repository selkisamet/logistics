-- CreateTable
CREATE TABLE "CustomerRecipient" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentRecipient" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "customerRecipientId" TEXT,
    "label" TEXT NOT NULL,
    CONSTRAINT "ShipmentRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerRecipient_customerId_idx" ON "CustomerRecipient"("customerId");

-- CreateIndex
CREATE INDEX "ShipmentRecipient_shipmentId_idx" ON "ShipmentRecipient"("shipmentId");

-- AddForeignKey
ALTER TABLE "CustomerRecipient" ADD CONSTRAINT "CustomerRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRecipient" ADD CONSTRAINT "ShipmentRecipient_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "InboundShipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRecipient" ADD CONSTRAINT "ShipmentRecipient_customerRecipientId_fkey" FOREIGN KEY ("customerRecipientId") REFERENCES "CustomerRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
