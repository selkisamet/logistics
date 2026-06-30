-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TIR', 'KAMYON', 'KAMYONET', 'PANELVAN', 'OTHER');

-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "vehicleId" TEXT;

-- AlterTable
ALTER TABLE "InboundShipment" ADD COLUMN     "vehicleId" TEXT;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'KAMYON',
    "driverName" TEXT,
    "driverPhone" TEXT,
    "trailerPlate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Dispatch_vehicleId_idx" ON "Dispatch"("vehicleId");

-- CreateIndex
CREATE INDEX "InboundShipment_vehicleId_idx" ON "InboundShipment"("vehicleId");

-- AddForeignKey
ALTER TABLE "InboundShipment" ADD CONSTRAINT "InboundShipment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
