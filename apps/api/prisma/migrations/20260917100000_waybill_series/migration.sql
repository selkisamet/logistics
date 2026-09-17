-- Matbu taşıma irsaliyesi serisi: seri harfi + sıradaki numara.
-- Uygulama numara ÜRETMEZ (164 GT: anlaşmalı matbaa basar); matbaanın bastığı sırayı takip
-- eder ve sevk anında bir numara tüketir. Operatör her sevkiyatta elle yazmaz.
-- Tek satır beklenir; servis ilk kaydı kullanır/oluşturur.
CREATE TABLE "WaybillSeries" (
  "id"        TEXT NOT NULL,
  "serial"    TEXT NOT NULL,
  "nextNo"    INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaybillSeries_pkey" PRIMARY KEY ("id")
);
