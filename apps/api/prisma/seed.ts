import { ParkingRole, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const employees = [
    {
      id: 'seed-employee-alex-morgan',
      corporateEmail: 'alex.morgan@folio3.com',
      googleSubject: 'folio3-google-alex-morgan-001',
      displayName: 'Alex Morgan',
      department: 'Engineering',
      employeeNumber: 'F3-1001',
    },
    {
      id: 'seed-employee-jamie-chen',
      corporateEmail: 'jamie.chen@folio3.com',
      googleSubject: 'folio3-google-jamie-chen-002',
      displayName: 'Jamie Chen',
      department: 'Security',
      employeeNumber: 'F3-1002',
    },
    {
      id: 'seed-employee-taylor-reed',
      corporateEmail: 'taylor.reed@folio3.com',
      googleSubject: 'folio3-google-taylor-reed-003',
      displayName: 'Taylor Reed',
      department: 'Operations',
      employeeNumber: 'F3-1003',
    },
  ] as const;

  for (const employee of employees) {
    await prisma.employee.upsert({
      where: { corporateEmail: employee.corporateEmail },
      create: employee,
      update: {
        googleSubject: employee.googleSubject,
        displayName: employee.displayName,
        department: employee.department,
        employeeNumber: employee.employeeNumber,
        isActive: true,
      },
    });
  }

  const [holder, securityGuard, administrator] = await Promise.all(
    employees.map((employee) =>
      prisma.employee.findUniqueOrThrow({ where: { corporateEmail: employee.corporateEmail } }),
    ),
  );

  const grants: Array<{ employeeId: string; role: ParkingRole }> = [
    { employeeId: holder.id, role: ParkingRole.EMPLOYEE },
    { employeeId: securityGuard.id, role: ParkingRole.EMPLOYEE },
    { employeeId: securityGuard.id, role: ParkingRole.SECURITY_GUARD },
    { employeeId: administrator.id, role: ParkingRole.EMPLOYEE },
    { employeeId: administrator.id, role: ParkingRole.PARKING_ADMINISTRATOR },
  ];

  for (const grant of grants) {
    await prisma.employeeRole.upsert({
      where: { employeeId_role: { employeeId: grant.employeeId, role: grant.role } },
      create: { ...grant, assignedByEmployeeId: administrator.id },
      update: { assignedByEmployeeId: administrator.id },
    });
  }

  const floors = [
    { floorNumber: 1, name: 'Ground Floor' },
    { floorNumber: 2, name: 'Level 2' },
  ];
  for (const floor of floors) {
    await prisma.parkingFloor.upsert({
      where: { floorNumber: floor.floorNumber },
      create: floor,
      update: { name: floor.name },
    });
  }

  const spaces = [
    { spaceCode: 'G-101', floorNumber: 1 },
    { spaceCode: 'G-102', floorNumber: 1 },
    { spaceCode: 'L2-201', floorNumber: 2 },
  ];
  for (const space of spaces) {
    const floor = await prisma.parkingFloor.findUniqueOrThrow({
      where: { floorNumber: space.floorNumber },
    });
    await prisma.parkingSpace.upsert({
      where: { spaceCode: space.spaceCode },
      create: { spaceCode: space.spaceCode, parkingFloorId: floor.id },
      update: { parkingFloorId: floor.id },
    });
  }

  const assignments = [
    {
      id: 'seed-assignment-alex-g101',
      employeeId: holder.id,
      spaceCode: 'G-101',
    },
    {
      id: 'seed-assignment-jamie-g102',
      employeeId: securityGuard.id,
      spaceCode: 'G-102',
    },
  ];
  for (const assignment of assignments) {
    const space = await prisma.parkingSpace.findUniqueOrThrow({
      where: { spaceCode: assignment.spaceCode },
    });
    await prisma.parkingAssignment.upsert({
      where: { id: assignment.id },
      create: {
        id: assignment.id,
        employeeId: assignment.employeeId,
        parkingSpaceId: space.id,
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
      },
      update: {
        employeeId: assignment.employeeId,
        parkingSpaceId: space.id,
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
        effectiveTo: null,
      },
    });
  }

  const dailyParkingReleaseTime = process.env.DAILY_PARKING_RELEASE_TIME?.trim() || '08:00';
  const officeTimeZone = process.env.OFFICE_TIME_ZONE?.trim() || 'UTC';
  await prisma.parkingConfiguration.upsert({
    where: { id: 'seed-parking-configuration' },
    create: {
      id: 'seed-parking-configuration',
      dailyParkingReleaseTime,
      officeTimeZone,
    },
    update: { dailyParkingReleaseTime, officeTimeZone },
  });
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed parking fixtures:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
