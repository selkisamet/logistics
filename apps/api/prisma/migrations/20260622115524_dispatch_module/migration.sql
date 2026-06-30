-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('DRAFT', 'DISPATCHED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "dispatchId" TEXT;

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'DRAFT',
    "destination" TEXT NOT NULL,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "notes" TEXT,
    "dispatchedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_reference_key" ON "Dispatch"("reference");

-- CreateIndex
CREATE INDEX "Receipt_dispatchId_idx" ON "Receipt"("dispatchId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
