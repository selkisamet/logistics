-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "dispatchId" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Package_dispatchId_idx" ON "Package"("dispatchId");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
