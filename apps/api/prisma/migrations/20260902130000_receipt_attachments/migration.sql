-- Mal kabule doğrudan bağlı belge görüntüsü (irsaliye/belge fotoğrafı).
-- Attachment şimdiye kadar yalnız Discrepancy'ye bağlanabiliyordu.
-- Tamamı ADDITIVE: kolon nullable, mevcut ekler etkilenmez.
ALTER TABLE "Attachment" ADD COLUMN "receiptId" TEXT;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Attachment_receiptId_idx" ON "Attachment"("receiptId");
