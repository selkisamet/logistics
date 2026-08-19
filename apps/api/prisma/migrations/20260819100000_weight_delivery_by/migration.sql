-- Kalem ağırlığı (kg) + ön ihbarda son teslim tarihi (termin).
-- Tamamı ADDITIVE: mevcut satırlar NULL alır, eski davranış değişmez.

-- Ağırlık: müşterinin irsaliyesindeki KİLO değeri. Ön ihbarda girilir, mal kabule
-- kopyalanır, sevk defterine snapshot'lanır; taşıma irsaliyesi KİLO ve tesellüm fişi
-- KG sütunlarına basılır (eskiden elle dolduruluyordu).
ALTER TABLE "ShipmentLine" ADD COLUMN "weightKg" DECIMAL(12,3);
ALTER TABLE "ReceiptLine"  ADD COLUMN "weightKg" DECIMAL(12,3);
ALTER TABLE "DispatchItem" ADD COLUMN "weightKg" DECIMAL(12,3);

-- Termin: depoda bekleyen yükün son teslim günü. Depo ekranında önceliklendirme için.
ALTER TABLE "InboundShipment" ADD COLUMN "deliveryBy" TIMESTAMP(3);
