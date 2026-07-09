-- Varsayılan depo (ön ihbarda ön-seçili gelir)
ALTER TABLE "Warehouse" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
