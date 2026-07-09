-- Ön ihbar kaynak/alıcılarına adres kopyası (fişte her noktayı ayrı göstermek için, additive)
ALTER TABLE "ShipmentSource" ADD COLUMN "address" TEXT;
ALTER TABLE "ShipmentRecipient" ADD COLUMN "address" TEXT;
