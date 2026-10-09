import { PrismaService } from '../prisma/prisma.service';
import { UtilizationService } from './utilization.service';
import { WeeklyReportScheduler } from './weekly-report.scheduler';
import { WeeklyReportService } from './weekly-report.service';

function schedulerWith(existingReport: unknown = null) {
  const generateForWeek = jest.fn().mockResolvedValue({});
  const prisma = {
    parkingConfiguration: { findFirst: jest.fn().mockResolvedValue({ officeTimeZone: 'UTC' }) },
    weeklyUtilizationReport: { findUnique: jest.fn().mockResolvedValue(existingReport) },
  } as unknown as PrismaService;
  const weeklyReport = {
    generateForWeek,
    previousWeek: new WeeklyReportService(
      prisma,
      {} as UtilizationService,
      { send: jest.fn() } as never,
    ).previousWeek,
  } as unknown as WeeklyReportService;
  const scheduler = new WeeklyReportScheduler(
    prisma,
    { recordForDate: jest.fn(), officeToday: jest.fn() } as unknown as UtilizationService,
    weeklyReport,
  );
  return { scheduler, generateForWeek };
}

describe('Weekly report scheduler', () => {
  it('[AC-9] generates the report on Monday morning for the week that just finished', async () => {
    const { scheduler, generateForWeek } = schedulerWith();
    // Monday 2026-06-15 08:00 UTC, after the default 07:00 report time.
    await expect(scheduler.tick(new Date('2026-06-15T08:00:00.000Z'))).resolves.toBe('generated');
    expect(generateForWeek).toHaveBeenCalledWith('2026-06-08');
  });

  it('[AC-9] does not generate before the configured hour, or on other weekdays', async () => {
    const monday = schedulerWith();
    await expect(monday.scheduler.tick(new Date('2026-06-15T05:00:00.000Z'))).resolves.toBe('skipped');
    expect(monday.generateForWeek).not.toHaveBeenCalled();

    const tuesday = schedulerWith();
    await expect(tuesday.scheduler.tick(new Date('2026-06-16T08:00:00.000Z'))).resolves.toBe('skipped');
    expect(tuesday.generateForWeek).not.toHaveBeenCalled();
  });

  it('[AC-9] generates a given week only once, even when the hourly cron fires repeatedly', async () => {
    const { scheduler, generateForWeek } = schedulerWith();
    await scheduler.tick(new Date('2026-06-15T08:00:00.000Z'));
    await scheduler.tick(new Date('2026-06-15T09:00:00.000Z'));
    await scheduler.tick(new Date('2026-06-15T10:00:00.000Z'));
    expect(generateForWeek).toHaveBeenCalledTimes(1);
  });

  it('[AC-9] skips a week that was already reported, for example after a restart', async () => {
    const { scheduler, generateForWeek } = schedulerWith({ id: 'report-1' });
    await expect(scheduler.tick(new Date('2026-06-15T08:00:00.000Z'))).resolves.toBe('skipped');
    expect(generateForWeek).not.toHaveBeenCalled();
  });
});
