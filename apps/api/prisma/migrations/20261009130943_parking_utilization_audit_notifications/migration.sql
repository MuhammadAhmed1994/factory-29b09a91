-- CreateEnum
CREATE TYPE "VehicleVerificationOutcome" AS ENUM ('TEMPORARY_ALLOCATION_AUTHORIZED', 'NO_VALID_TEMPORARY_ALLOCATION', 'PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS', 'VEHICLE_NOT_REGISTERED');

-- CreateEnum
CREATE TYPE "ParkingUtilizationOutcome" AS ENUM ('DEDICATED_UTILIZED', 'DEDICATED_UNUSED', 'TEMPORARY_UTILIZED', 'TEMPORARY_UNUSED');

-- CreateEnum
CREATE TYPE "ParkingAuditEvent" AS ENUM ('RELEASE_SCHEDULED', 'RELEASE_CANCELLED', 'RELEASE_CLAIMED', 'RELEASE_REVERTED_BY_ADMINISTRATOR', 'VEHICLE_VERIFIED');

-- CreateEnum
CREATE TYPE "ParkingNotificationType" AS ENUM ('PARKING_AVAILABLE');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "color" TEXT;

-- CreateTable
CREATE TABLE "VehicleEntryRecord" (
    "id" TEXT NOT NULL,
    "vehicleIdentifier" TEXT NOT NULL,
    "vehicleId" TEXT,
    "employeeId" TEXT,
    "officeDate" DATE NOT NULL,
    "outcome" "VehicleVerificationOutcome" NOT NULL,
    "authorized" BOOLEAN,
    "entryGranted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SECURITY_DESK',
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleEntryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingUtilizationEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "officeDate" DATE NOT NULL,
    "outcome" "ParkingUtilizationOutcome" NOT NULL,
    "spaceCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingUtilizationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingAuditLog" (
    "id" TEXT NOT NULL,
    "event" "ParkingAuditEvent" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorEmployeeId" TEXT,
    "detail" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingNotification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "ParkingNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "officeDate" DATE NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParkingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyUtilizationReport" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "statistics" JSONB NOT NULL,
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipients" TEXT[],
    "emailedAt" TIMESTAMPTZ(3),
    "deliveryError" TEXT,

    CONSTRAINT "WeeklyUtilizationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleEntryRecord_officeDate_idx" ON "VehicleEntryRecord"("officeDate");

-- CreateIndex
CREATE INDEX "VehicleEntryRecord_vehicleIdentifier_officeDate_idx" ON "VehicleEntryRecord"("vehicleIdentifier", "officeDate");

-- CreateIndex
CREATE INDEX "VehicleEntryRecord_employeeId_officeDate_idx" ON "VehicleEntryRecord"("employeeId", "officeDate");

-- CreateIndex
CREATE INDEX "VehicleEntryRecord_vehicleId_idx" ON "VehicleEntryRecord"("vehicleId");

-- CreateIndex
CREATE INDEX "ParkingUtilizationEvent_officeDate_idx" ON "ParkingUtilizationEvent"("officeDate");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingUtilizationEvent_employeeId_officeDate_outcome_key" ON "ParkingUtilizationEvent"("employeeId", "officeDate", "outcome");

-- CreateIndex
CREATE INDEX "ParkingAuditLog_entityType_entityId_idx" ON "ParkingAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ParkingAuditLog_occurredAt_idx" ON "ParkingAuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "ParkingNotification_employeeId_readAt_idx" ON "ParkingNotification"("employeeId", "readAt");

-- CreateIndex
CREATE INDEX "ParkingNotification_officeDate_idx" ON "ParkingNotification"("officeDate");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyUtilizationReport_weekStart_key" ON "WeeklyUtilizationReport"("weekStart");

-- AddForeignKey
ALTER TABLE "VehicleEntryRecord" ADD CONSTRAINT "VehicleEntryRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleEntryRecord" ADD CONSTRAINT "VehicleEntryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingUtilizationEvent" ADD CONSTRAINT "ParkingUtilizationEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingUtilizationEvent" ADD CONSTRAINT "ParkingUtilizationEvent_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingAuditLog" ADD CONSTRAINT "ParkingAuditLog_actorEmployeeId_fkey" FOREIGN KEY ("actorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingNotification" ADD CONSTRAINT "ParkingNotification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
