import { ParkingUtilizationOutcome } from '@prisma/client';
import { MailerService } from '../common/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { UtilizationService } from './utilization.service';
import { WeeklyReportService } from './weekly-report.service';
import { weekBounds } from '../common/office-time';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function prismaFor(options: {
  assignments?: unknown[];
  allocations?: unknown[];
  entries?: unknown[];
  events?: unknown[];
  releases?: unknown[];
}) {
  const createMany = jest.fn().mockResolvedValue({ count: 0 });
  const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    parkingConfiguration: { findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'UTC' }) },
    parkingAssignment: { findMany: jest.fn().mockResolvedValue(options.assignments ?? []) },
    parkingAllocation: { findMany: jest.fn().mockResolvedValue(options.allocations ?? []) },
    vehicleEntryRecord: { findMany: jest.fn().mockResolvedValue(options.entries ?? []) },
    parkingUtilizationEvent: {
      findMany: jest.fn().mockResolvedValue(options.events ?? []),
      createMany,
      deleteMany,
    },
    parkingRelease: { findMany: jest.fn().mockResolvedValue(options.releases ?? []) },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  return { prisma, createMany };
}

describe('Parking utilization tracking', () => {
  it('[AC-9] records unused dedicated parking when a holder neither released nor entered', async () => {
    const { prisma, createMany } = prismaFor({
      assignments: [
        {
          employeeId: 'holder-1',
          employee: { vehicles: [{ id: 'vehicle-1' }] },
          parkingSpace: { spaceCode: 'G-101' },
          releases: [],
        },
      ],
      entries: [],
    });
    const service = new UtilizationService(prisma);

    const result = await service.recordForDate('2026-06-10');

    expect(result).toEqual({ date: '2026-06-10', recorded: 1 });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        employeeId: 'holder-1',
        vehicleId: 'vehicle-1',
        outcome: ParkingUtilizationOutcome.DEDICATED_UNUSED,
        spaceCode: 'G-101',
      })],
    }));
  });

  it('[AC-9] does not report a holder who released the space, and marks entered holders utilized', async () => {
    const { prisma, createMany } = prismaFor({
      assignments: [
        {
          employeeId: 'released-holder',
          employee: { vehicles: [] },
          parkingSpace: { spaceCode: 'G-101' },
          releases: [{ status: 'OPEN' }],
        },
        {
          employeeId: 'present-holder',
          employee: { vehicles: [{ id: 'vehicle-2' }] },
          parkingSpace: { spaceCode: 'G-102' },
          releases: [],
        },
      ],
      entries: [{ employeeId: 'present-holder' }],
    });
    const service = new UtilizationService(prisma);

    await service.recordForDate('2026-06-10');

    const [{ data }] = createMany.mock.calls[0];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      employeeId: 'present-holder',
      outcome: ParkingUtilizationOutcome.DEDICATED_UTILIZED,
    });
  });

  it('[AC-9] records a claimed temporary space that was never driven in as unused', async () => {
    const { prisma, createMany } = prismaFor({
      allocations: [
        {
          employeeId: 'claimer-1',
          employee: { vehicles: [{ id: 'vehicle-3' }] },
          parkingRelease: { parkingAssignment: { parkingSpace: { spaceCode: 'G-105' } } },
        },
      ],
      entries: [],
    });
    const service = new UtilizationService(prisma);

    await service.recordForDate('2026-06-10');

    const [{ data }] = createMany.mock.calls[0];
    expect(data[0]).toMatchObject({
      employeeId: 'claimer-1',
      outcome: ParkingUtilizationOutcome.TEMPORARY_UNUSED,
      spaceCode: 'G-105',
    });
  });
});

describe('Weekly utilization report', () => {
  it('[AC-9] reports Monday to Sunday and computes the statistics the Spec lists', async () => {
    const { prisma } = prismaFor({
      events: [
        {
          employeeId: 'holder-1',
          officeDate: day('2026-06-10'),
          outcome: ParkingUtilizationOutcome.DEDICATED_UNUSED,
          spaceCode: 'G-101',
          employee: { id: 'holder-1', displayName: 'Holder One', corporateEmail: 'holder1@folio3.com' },
        },
        {
          employeeId: 'claimer-1',
          officeDate: day('2026-06-10'),
          outcome: ParkingUtilizationOutcome.TEMPORARY_UTILIZED,
          spaceCode: 'G-102',
          employee: { id: 'claimer-1', displayName: 'Claimer One', corporateEmail: 'claimer1@folio3.com' },
        },
      ],
      releases: [{ releaseDate: day('2026-06-10'), status: 'CLAIMED' }],
    });
    const service = new UtilizationService(prisma);

    const statistics = await service.buildStatistics('2026-06-10');

    expect(statistics.weekStart).toBe('2026-06-08');
    expect(statistics.weekEnd).toBe('2026-06-14');
    expect(statistics.unusedDedicated).toHaveLength(1);
    expect(statistics.unusedTemporary).toHaveLength(0);
    expect(statistics.totals).toMatchObject({
      releasedSpaces: 1,
      temporaryClaims: 1,
      allocatedSpaces: 2,
      utilizedSpaces: 1,
      utilizationPercentage: 50,
    });
  });

  it('[AC-9] stores the report and records why it was not emailed when SMTP is unconfigured', async () => {
    const { prisma } = prismaFor({});
    const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({
      id: 'report-1',
      ...create,
      generatedAt: new Date('2026-06-15T07:00:00.000Z'),
    }));
    (prisma as unknown as { weeklyUtilizationReport: unknown }).weeklyUtilizationReport = { upsert };
    const mailer = {
      send: jest.fn().mockResolvedValue('SMTP is not configured'),
    } as unknown as MailerService;
    const service = new WeeklyReportService(prisma, new UtilizationService(prisma), mailer);

    const result = await service.generateForWeek('2026-06-08', ['ops@folio3.com']);

    expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: ['ops@folio3.com'] }));
    expect(result.deliveryError).toBe('SMTP is not configured');
    expect(result.emailedAt).toBeNull();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('[AC-9] targets the week that just finished', () => {
    const { prisma } = prismaFor({});
    const service = new WeeklyReportService(prisma, new UtilizationService(prisma), {
      send: jest.fn(),
    } as unknown as MailerService);

    // Monday 2026-06-15 reports on Mon 2026-06-08 .. Sun 2026-06-14.
    expect(service.previousWeek('2026-06-15')).toEqual(weekBounds('2026-06-08'));
    expect(service.previousWeek('2026-06-15').weekStart).toBe('2026-06-08');
    expect(service.previousWeek('2026-06-15').weekEnd).toBe('2026-06-14');
  });
});
