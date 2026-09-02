-- Ön ihbarın para birimi: satır birim fiyatları ve tesellüm fişindeki tutarlar bu cinsten.
-- Additive: mevcut kayıtlar varsayılan 'TRY' alır, eski davranış değişmez.
-- (Taşıma irsaliyesindeki navlun `Dispatch.freightAmount` AYRI bir alandır ve ₺ kalır.)
ALTER TABLE "InboundShipment" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY';
