import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityService } from './security.service';

function auditSpy(): { audit: AuditService; record: jest.Mock } {
  const record = jest.fn().mockResolvedValue(undefined);
  return { audit: { record } as unknown as AuditService, record };
}

describe('SecurityService vehicle verification', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('[AC-6] authorizes a vehicle with an allocation released for the current office-local day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T02:00:00.000Z'));
    const createEntry = jest.fn().mockResolvedValue({ id: 'entry-1' });
    const prisma = {
      parkingConfiguration: {
        findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'America/Los_Angeles' }),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'vehicle-1',
          employeeId: 'employee-1',
          hasPermanentSticker: false,
        }),
      },
      parkingAllocation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'allocation-1' }),
      },
      vehicleEntryRecord: { create: createEntry },
    } as unknown as PrismaService;
    const { audit, record } = auditSpy();
    const service = new SecurityService(prisma, audit);

    await expect(service.verifyVehicle('ABC-123')).resolves.toEqual({
      vehicleIdentifier: 'ABC-123',
      date: '2024-12-31',
      authorized: true,
      outcome: 'TEMPORARY_ALLOCATION_AUTHORIZED',
      indicator: 'GREEN',
      entryGranted: true,
      recordId: 'entry-1',
    });
    expect(prisma.parkingAllocation.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 'employee-1',
        parkingRelease: {
          is: {
            releaseDate: new Date('2024-12-31T00:00:00.000Z'),
            status: 'CLAIMED',
          },
        },
      },
      select: { id: true },
    });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('[AC-6] records every verification attempt, including refusals and unregistered vehicles', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    const createEntry = jest.fn().mockResolvedValue({ id: 'entry-2' });
    const prisma = {
      parkingConfiguration: { findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'UTC' }) },
      vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
      parkingAllocation: { findFirst: jest.fn() },
      vehicleEntryRecord: { create: createEntry },
    } as unknown as PrismaService;
    const { audit } = auditSpy();
    const service = new SecurityService(prisma, audit);

    const result = await service.verifyVehicle('UNKNOWN-1', { source: 'LPR_CAMERA' });
    expect(result).toMatchObject({
      authorized: false,
      outcome: 'VEHICLE_NOT_REGISTERED',
      indicator: 'OFF',
      entryGranted: false,
    });
    expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        vehicleIdentifier: 'UNKNOWN-1',
        outcome: 'VEHICLE_NOT_REGISTERED',
        entryGranted: false,
        source: 'LPR_CAMERA',
      }),
    }));
  });

  it('[AC-6] admits a permanent-sticker vehicle without deciding authorization itself', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T12:00:00.000Z'));
    const allocationLookup = jest.fn();
    const prisma = {
      parkingConfiguration: { findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'UTC' }) },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'vehicle-9',
          employeeId: 'employee-9',
          hasPermanentSticker: true,
        }),
      },
      parkingAllocation: { findFirst: allocationLookup },
      vehicleEntryRecord: { create: jest.fn().mockResolvedValue({ id: 'entry-3' }) },
    } as unknown as PrismaService;
    const { audit } = auditSpy();
    const service = new SecurityService(prisma, audit);

    const result = await service.verifyVehicle('STICKER-1');
    expect(result).toMatchObject({
      authorized: null,
      outcome: 'PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS',
      entryGranted: true,
      // The system makes no authorization decision, so it must not claim one with a green light.
      indicator: 'OFF',
    });
    expect(allocationLookup).not.toHaveBeenCalled();
  });
});
