-- Müşteriye vergi dairesi + vergi no ve çoklu yetkili kişi (additive)
ALTER TABLE "Customer" ADD COLUMN "taxOffice" TEXT;
ALTER TABLE "Customer" ADD COLUMN "taxNumber" TEXT;

CREATE TABLE "CustomerContact" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "extension" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

ALTER TABLE "CustomerContact"
  ADD CONSTRAINT "CustomerContact_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
