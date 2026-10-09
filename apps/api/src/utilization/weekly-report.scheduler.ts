import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { config } from '../app.config';
import { officeDate } from '../common/office-time';
import { PrismaService } from '../prisma/prisma.service';
import { UtilizationService } from './utilization.service';
import { WeeklyReportService } from './weekly-report.service';

/**
 * Runs the Monday-morning report (US-006). The cron fires every hour and the service decides
 * whether it is Monday at the configured office-local hour, so one schedule stays correct across
 * time zones and DST instead of hard-coding a UTC hour.
 */
@Injectable()
export class WeeklyReportScheduler {
  private readonly logger = new Logger(WeeklyReportScheduler.name);
  private lastGeneratedWeek?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly utilization: UtilizationService,
    private readonly weeklyReport: WeeklyReportService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourly(): Promise<void> {
    try {
      await this.tick(new Date());
    } catch (error) {
      this.logger.error(
        `Weekly report tick failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /** Exposed for tests: generates the report when the instant is Monday at the configured hour. */
  async tick(now: Date): Promise<'generated' | 'skipped'> {
    const configuration = await this.prisma.parkingConfiguration.findFirst({
      select: { officeTimeZone: true },
    });
    const timeZone = configuration?.officeTimeZone ?? config.officeTimeZone;
    const today = officeDate(now, timeZone);
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now),
    );
    const [reportHour] = config.weeklyReportTime.split(':').map(Number);

    if (weekday !== 'Mon' || hour < reportHour) return 'skipped';

    const { weekStart } = this.weeklyReport.previousWeek(today);
    if (this.lastGeneratedWeek === weekStart) return 'skipped';

    const existing = await this.prisma.weeklyUtilizationReport.findUnique({
      where: { weekStart: new Date(`${weekStart}T00:00:00.000Z`) },
      select: { id: true },
    });
    if (existing) {
      this.lastGeneratedWeek = weekStart;
      return 'skipped';
    }

    await this.weeklyReport.generateForWeek(weekStart);
    this.lastGeneratedWeek = weekStart;
    return 'generated';
  }

  /** Keeps the current day's utilization current so the report has data even before Monday. */
  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async recordToday(): Promise<void> {
    try {
      const today = await this.utilization.officeToday();
      await this.utilization.recordForDate(today);
    } catch (error) {
      this.logger.error(
        `Daily utilization capture failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
