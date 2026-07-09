-- Müşteri depo/alıcılarına telefon (additive)
ALTER TABLE "CustomerLocation" ADD COLUMN "phone" TEXT;
ALTER TABLE "CustomerRecipient" ADD COLUMN "phone" TEXT;
