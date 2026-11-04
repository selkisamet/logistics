-- CreateEnum
CREATE TYPE "PickupTaskStatus" AS ENUM ('OPEN', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "regionId" TEXT,
ADD COLUMN     "storedRegionId" TEXT;

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupTask" (
    "id" TEXT NOT NULL,
    "status" "PickupTaskStatus" NOT NULL DEFAULT 'OPEN',
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "regionId" TEXT,
    "recipientCustomerId" TEXT,
    "note" TEXT,
    "receiptId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PickupTask_receiptId_key" ON "PickupTask"("receiptId");

-- CreateIndex
CREATE INDEX "PickupTask_status_idx" ON "PickupTask"("status");

-- CreateIndex
CREATE INDEX "PickupTask_vehicleId_idx" ON "PickupTask"("vehicleId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_storedRegionId_fkey" FOREIGN KEY ("storedRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_recipientCustomerId_fkey" FOREIGN KEY ("recipientCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickupTask" ADD CONSTRAINT "PickupTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
