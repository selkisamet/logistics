-- Alıcı = kayıtlı Müşteri: ön ihbara recipientCustomerId, boşaltma lokasyonu için
-- ShipmentRecipient.customerLocationId (hepsi additive/opsiyonel)
ALTER TABLE "InboundShipment" ADD COLUMN "recipientCustomerId" TEXT;
ALTER TABLE "ShipmentRecipient" ADD COLUMN "customerLocationId" TEXT;

CREATE INDEX "InboundShipment_recipientCustomerId_idx" ON "InboundShipment"("recipientCustomerId");

ALTER TABLE "InboundShipment"
  ADD CONSTRAINT "InboundShipment_recipientCustomerId_fkey"
  FOREIGN KEY ("recipientCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShipmentRecipient"
  ADD CONSTRAINT "ShipmentRecipient_customerLocationId_fkey"
  FOREIGN KEY ("customerLocationId") REFERENCES "CustomerLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
