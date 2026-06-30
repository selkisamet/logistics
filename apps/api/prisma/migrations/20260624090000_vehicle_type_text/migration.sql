-- Araç tipini enum'dan serbest metne çevir (araç tablosu boş, veri kaybı yok)
ALTER TABLE "Vehicle" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Vehicle" ALTER COLUMN "type" SET DATA TYPE TEXT USING "type"::text;
ALTER TABLE "Vehicle" ALTER COLUMN "type" SET DEFAULT 'Kamyon';
DROP TYPE "VehicleType";
