import { ConflictException } from '@nestjs/common';
import { ParkingReleaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingService } from './parking.service';

const frozenNow = new Date('2026-06-10T14:00:00.000Z');

function releaseFixture(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'release-1',
    parkingAssignmentId: 'assignment-1',
    releaseDate: new Date('2026-06-10T00:00:00.000Z'),
    claimableAt: new Date('2026-06-10T15:00:00.000Z'),
    status: ParkingReleaseStatus.OPEN,
    cancelledAt: null,
    createdAt: new Date('2026-06-01T12:00:00.000Z'),
    updatedAt: new Date('2026-06-01T12:00:00.000Z'),
    allocation: null,
    parkingAssignment: {
      employeeId: 'holder-1',
      parkingSpace: {
        id: 'space-1',
        spaceCode: 'P-14',
        parkingFloor: { floorNumber: 4, name: 'Floor 4' },
      },
    },
    ...overrides,
  };
}

function serviceWith(prismaOverrides: Record<string, unknown>): ParkingService {
  const prisma = {
    parkingConfiguration: {
      findFirst: jest.fn().mockResolvedValue({
        dailyParkingReleaseTime: '08:00',
        officeTimeZone: 'America/Los_Angeles',
      }),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;
  return new ParkingService(prisma);
}

describe('Parking release workflows', () => {
  afterEach(() => jest.useRealTimers());

  it('[AC-1] creates a release for a date within the office-local 30-day window', async () => {
    jest.useFakeTimers().setSystemTime(frozenNow);
    const stored = releaseFixture();
    const prisma = {
      parkingAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1', releases: [] }),
      },
      parkingRelease: { create: jest.fn().mockResolvedValue(stored) },
    };
    const service = serviceWith(prisma);
    const result = await service.createRelease('holder-1', '2026-06-10');
    expect(result).toMatchObject({ id: 'release-1', status: 'OPEN' });
    expect(result.releaseDate.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(prisma.parkingRelease.create).toHaveBeenCalledTimes(1);
  });

  it('[AC-2] snapshots the configured release instant for future, early same-day, and post-cutoff releases', async () => {
    jest.useFakeTimers().setSystemTime(frozenNow);
    const create = jest.fn().mockImplementation(({ data }) => Promise.resolve({
      ...releaseFixture(), releaseDate: data.releaseDate, claimableAt: data.claimableAt,
    }));
    const service = serviceWith({
      parkingAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1', releases: [] }) },
      parkingRelease: { create },
    });
    const early = await service.createRelease('holder-1', '2026-06-10');
    const future = await service.createRelease('holder-1', '2026-06-11');
    expect(early.claimableAt.toISOString()).toBe('2026-06-10T15:00:00.000Z');
    expect(early.claimableAt.getTime()).toBeGreaterThan(Date.now());
    expect(future.claimableAt.toISOString()).toBe('2026-06-11T15:00:00.000Z');

    jest.setSystemTime(new Date('2026-06-10T16:00:00.000Z'));
    const afterCutoff = await service.createRelease('holder-1', '2026-06-10');
    expect(afterCutoff.claimableAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('[AC-3] lists and inspects release status history and returns cancelled status', async () => {
    const open = releaseFixture();
    const cancelled = releaseFixture({
      status: ParkingReleaseStatus.CANCELLED,
      cancelledAt: new Date('2026-06-02T12:00:00.000Z'),
    });
    const prisma = {
      parkingRelease: {
        findMany: jest.fn().mockResolvedValue([open]),
        findFirst: jest.fn().mockResolvedValueOnce(open).mockResolvedValueOnce(cancelled),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = serviceWith(prisma);
    expect((await service.listReleases('holder-1')).map(({ status }) => status)).toEqual(['OPEN']);
    expect((await service.getRelease('holder-1', 'release-1')).statusChanges[0].status).toBe('OPEN');
    const result = await service.cancelRelease('holder-1', 'release-1');
    expect(result.status).toBe('CANCELLED');
    expect(result.statusChanges.map(({ status }) => status)).toEqual(['OPEN', 'CANCELLED']);
  });

  it('[AC-4] lists only claimable spaces and returns claimant, allocation time, date, and floor', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T16:00:00.000Z'));
    const release = releaseFixture({ claimableAt: new Date('2026-06-10T15:00:00.000Z') });
    const claimant = { id: 'claimer', displayName: 'Claimant One', corporateEmail: 'one@folio3.com' };
    const allocation = {
      employeeId: 'claimer', allocatedAt: new Date(), employee: claimant,
      parkingRelease: release,
    };
    const tx = {
      parkingRelease: {
        findUnique: jest.fn().mockResolvedValue(release),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      parkingAllocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(allocation),
      },
    };
    const service = serviceWith({
      parkingRelease: { findMany: jest.fn().mockResolvedValue([release]) },
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(tx)),
    });
    const availability = await service.getAvailability();
    expect(availability).toHaveLength(1);
    const result = await service.claimRelease('claimer', 'release-1');
    expect(result).toMatchObject({
      status: 'CLAIMED',
      claimant: { id: 'claimer', displayName: 'Claimant One' },
      assignedFloor: 4,
      spaceCode: 'P-14',
    });
    expect(result.allocationDate.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(result.allocatedAt).toBeInstanceOf(Date);
  });

  it('[AC-5] atomically allows only the first concurrent claimant and rejects the later request', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-10T16:00:00.000Z'));
    const release = releaseFixture({ claimableAt: new Date('2026-06-10T15:00:00.000Z') });
    let currentStatus: ParkingReleaseStatus = ParkingReleaseStatus.OPEN;
    let createdAllocations = 0;
    const tx = {
      parkingRelease: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...release, status: currentStatus })),
        updateMany: jest.fn().mockImplementation(async () => {
          if (currentStatus !== ParkingReleaseStatus.OPEN) return { count: 0 };
          currentStatus = ParkingReleaseStatus.CLAIMED;
          return { count: 1 };
        }),
      },
      parkingAllocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          createdAllocations += 1;
          return {
            employeeId: data.employeeId,
            allocatedAt: data.allocatedAt,
            employee: { id: data.employeeId, displayName: data.employeeId, corporateEmail: `${data.employeeId}@folio3.com` },
            parkingRelease: release,
          };
        }),
      },
    };
    const service = serviceWith({
      $transaction: jest.fn((callback: (value: unknown) => unknown) => callback(tx)),
    });
    const outcomes = await Promise.allSettled([
      service.claimRelease('employee-a', 'release-1'),
      service.claimRelease('employee-b', 'release-1'),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason instanceof ConflictException)).toHaveLength(1);
    expect(createdAllocations).toBe(1);
    expect(currentStatus).toBe(ParkingReleaseStatus.CLAIMED);
  });
});
