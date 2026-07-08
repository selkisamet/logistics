-- Ön ihbara taraf/adres/ödeme + fiyat alanları (hepsi opsiyonel/defaultlu — additive)
ALTER TABLE "InboundShipment" ADD COLUMN "principalName" TEXT;
ALTER TABLE "InboundShipment" ADD COLUMN "loadAddress" TEXT;
ALTER TABLE "InboundShipment" ADD COLUMN "deliveryAddress" TEXT;
ALTER TABLE "InboundShipment" ADD COLUMN "paymentType" TEXT;
ALTER TABLE "InboundShipment" ADD COLUMN "showAmountOnSlip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InboundShipment" ADD COLUMN "vatIncluded" BOOLEAN NOT NULL DEFAULT false;

-- Birim fiyat (satır bazında)
ALTER TABLE "ShipmentLine" ADD COLUMN "unitPrice" DECIMAL(12,2);
ALTER TABLE "ReceiptLine" ADD COLUMN "unitPrice" DECIMAL(12,2);
