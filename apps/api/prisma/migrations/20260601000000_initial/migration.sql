-- CreateEnum
CREATE TYPE "ParkingReleaseStatus" AS ENUM ('OPEN', 'CLAIMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParkingRole" AS ENUM ('EMPLOYEE', 'SECURITY_GUARD', 'PARKING_ADMINISTRATOR');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "corporateEmail" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "department" TEXT,
    "employeeNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingFloor" (
    "id" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSpace" (
    "id" TEXT NOT NULL,
    "parkingFloorId" TEXT NOT NULL,
    "spaceCode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "parkingSpaceId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingRelease" (
    "id" TEXT NOT NULL,
    "parkingAssignmentId" TEXT NOT NULL,
    "releaseDate" DATE NOT NULL,
    "claimableAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "ParkingReleaseStatus" NOT NULL DEFAULT 'OPEN',
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingAllocation" (
    "id" TEXT NOT NULL,
    "parkingReleaseId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vehicleIdentifier" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "hasPermanentSticker" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRole" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "ParkingRole" NOT NULL,
    "assignedByEmployeeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmployeeRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingConfiguration" (
    "id" TEXT NOT NULL,
    "dailyParkingReleaseTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "officeTimeZone" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ParkingConfiguration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ParkingConfiguration_dailyParkingReleaseTime_check" CHECK ("dailyParkingReleaseTime" ~ '^[0-2][0-9]:[0-5][0-9]$' AND substring("dailyParkingReleaseTime", 1, 2)::integer < 24)
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_corporateEmail_key" ON "Employee"("corporateEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_googleSubject_key" ON "Employee"("googleSubject");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingFloor_floorNumber_key" ON "ParkingFloor"("floorNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSpace_spaceCode_key" ON "ParkingSpace"("spaceCode");

-- CreateIndex
CREATE INDEX "ParkingSpace_parkingFloorId_idx" ON "ParkingSpace"("parkingFloorId");

-- CreateIndex
CREATE INDEX "ParkingAssignment_employeeId_idx" ON "ParkingAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "ParkingAssignment_parkingSpaceId_idx" ON "ParkingAssignment"("parkingSpaceId");

-- CreateIndex
CREATE INDEX "ParkingRelease_parkingAssignmentId_idx" ON "ParkingRelease"("parkingAssignmentId");

-- CreateIndex
CREATE INDEX "ParkingRelease_releaseDate_status_claimableAt_idx" ON "ParkingRelease"("releaseDate", "status", "claimableAt");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingAllocation_parkingReleaseId_key" ON "ParkingAllocation"("parkingReleaseId");

-- CreateIndex
CREATE INDEX "ParkingAllocation_employeeId_idx" ON "ParkingAllocation"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleIdentifier_key" ON "Vehicle"("vehicleIdentifier");

-- CreateIndex
CREATE INDEX "Vehicle_employeeId_idx" ON "Vehicle"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRole_employeeId_role_key" ON "EmployeeRole"("employeeId", "role");

-- CreateIndex
CREATE INDEX "EmployeeRole_assignedByEmployeeId_idx" ON "EmployeeRole"("assignedByEmployeeId");

-- AddForeignKey
ALTER TABLE "ParkingSpace" ADD CONSTRAINT "ParkingSpace_parkingFloorId_fkey" FOREIGN KEY ("parkingFloorId") REFERENCES "ParkingFloor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_parkingSpaceId_fkey" FOREIGN KEY ("parkingSpaceId") REFERENCES "ParkingSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingRelease" ADD CONSTRAINT "ParkingRelease_parkingAssignmentId_fkey" FOREIGN KEY ("parkingAssignmentId") REFERENCES "ParkingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingAllocation" ADD CONSTRAINT "ParkingAllocation_parkingReleaseId_fkey" FOREIGN KEY ("parkingReleaseId") REFERENCES "ParkingRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingAllocation" ADD CONSTRAINT "ParkingAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRole" ADD CONSTRAINT "EmployeeRole_assignedByEmployeeId_fkey" FOREIGN KEY ("assignedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
