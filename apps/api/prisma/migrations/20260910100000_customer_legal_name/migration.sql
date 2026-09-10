-- Müşterinin TAM ÜNVANI — belgelerde (tesellüm fişi, taşıma irsaliyesi) basılır.
-- `name` görünen/kısa ad olarak kalır: listeler ve seçim kutuları onu kullanır.
-- Additive ve nullable: boşsa belgelerde `name` basılır, eski davranış korunur.
ALTER TABLE "Customer" ADD COLUMN "legalName" TEXT;
