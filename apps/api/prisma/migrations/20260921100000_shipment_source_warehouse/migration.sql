-- Ön ihbarın "yükleme yeri" artık göndericinin deposu kadar BİZİM depomuz da olabilir.
-- Mal her zaman müşteriden alınmıyor; bazı seferlerde kendi depomuzdan yükleniyor.
-- Daha önce bu ancak serbest metin yazılarak girilebiliyordu ve adres kaydedilmiyordu.
-- Tamamı ADDITIVE: kolon nullable, mevcut kaynaklar etkilenmez.
ALTER TABLE "ShipmentSource" ADD COLUMN "warehouseId" TEXT;

-- ON DELETE RESTRICT: adres/etiket kayda kopyalanmış olsa da, kullanımdaki depo
-- silinince kaynağın hangi depo olduğu bilgisi sessizce kaybolmasın.
ALTER TABLE "ShipmentSource"
  ADD CONSTRAINT "ShipmentSource_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
