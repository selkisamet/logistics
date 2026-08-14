-- Müşteri pasife alma (soft delete).
-- Geçmişi olan müşteri SİLİNEMEZ: tesellüm fişi / taşıma irsaliyesi müşteri bilgisini
-- (ünvan, VD/VKN, adres) canlı okur ve VUK belgeleri 5 yıl saklanmalıdır.
-- Pasif müşteri listede ve ön ihbar seçiminde görünmez; belgeleri sağlam kalır.
ALTER TABLE "Customer" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
