import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { config } from '../app.config';
import { MailerService } from '../common/mailer.service';
import { addCalendarDays, weekBounds } from '../common/office-time';
import { parseCalendarDate } from '../common/office-time';
import { PrismaService } from '../prisma/prisma.service';
import { UtilizationService, UtilizationStatistics } from './utilization.service';

export interface WeeklyReportResult {
  id: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: Date;
  recipients: string[];
  emailedAt: Date | null;
  deliveryError: string | null;
  statistics: UtilizationStatistics;
}

/**
 * Generates and emails the weekly parking utilization report (US-006). The report covers the week
 * that just finished, is stored whether or not delivery succeeds, and is re-generatable for a given
 * week without creating duplicates.
 */
@Injectable()
export class WeeklyReportService {
  private readonly logger = new Logger(WeeklyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly utilization: UtilizationService,
    private readonly mailer: MailerService,
  ) {}

  /** The Monday-start week preceding the office-local day `today`. */
  previousWeek(today: string): { weekStart: string; weekEnd: string } {
    return weekBounds(addCalendarDays(today, -7));
  }

  async generateForWeek(weekStartDate: string, recipients?: string[]): Promise<WeeklyReportResult> {
    const statistics = await this.utilization.buildStatistics(weekStartDate);
    const to = recipients ?? config.reportRecipients;
    const summary = this.render(statistics);

    const deliveryError = to.length ? await this.mailer.send({
      to,
      subject: `Parking utilization report - ${statistics.weekStart} to ${statistics.weekEnd}`,
      text: summary,
    }) : 'No recipients are configured';

    const stored = await this.prisma.weeklyUtilizationReport.upsert({
      where: { weekStart: parseCalendarDate(statistics.weekStart) },
      create: {
        weekStart: parseCalendarDate(statistics.weekStart),
        weekEnd: parseCalendarDate(statistics.weekEnd),
        statistics: statistics as unknown as Prisma.InputJsonValue,
        recipients: to,
        emailedAt: deliveryError ? null : new Date(),
        deliveryError: deliveryError ?? null,
      },
      update: {
        weekEnd: parseCalendarDate(statistics.weekEnd),
        statistics: statistics as unknown as Prisma.InputJsonValue,
        recipients: to,
        generatedAt: new Date(),
        emailedAt: deliveryError ? null : new Date(),
        deliveryError: deliveryError ?? null,
      },
    });

    this.logger.log(
      `Weekly utilization report ${statistics.weekStart}..${statistics.weekEnd} generated` +
        (deliveryError ? ` (not emailed: ${deliveryError})` : ` and emailed to ${to.join(', ')}`),
    );

    return {
      id: stored.id,
      weekStart: statistics.weekStart,
      weekEnd: statistics.weekEnd,
      generatedAt: stored.generatedAt,
      recipients: stored.recipients,
      emailedAt: stored.emailedAt,
      deliveryError: stored.deliveryError,
      statistics,
    };
  }

  async listReports(limit = 12): Promise<WeeklyReportResult[]> {
    const stored = await this.prisma.weeklyUtilizationReport.findMany({
      orderBy: { weekStart: 'desc' },
      take: limit,
    });
    return stored.map((report) => ({
      id: report.id,
      weekStart: report.weekStart.toISOString().slice(0, 10),
      weekEnd: report.weekEnd.toISOString().slice(0, 10),
      generatedAt: report.generatedAt,
      recipients: report.recipients,
      emailedAt: report.emailedAt,
      deliveryError: report.deliveryError,
      statistics: report.statistics as unknown as UtilizationStatistics,
    }));
  }

  private render(statistics: UtilizationStatistics): string {
    const lines: string[] = [
      `Parking utilization report`,
      `Week: ${statistics.weekStart} to ${statistics.weekEnd}`,
      '',
      `Total released parking spaces: ${statistics.totals.releasedSpaces}`,
      `Total temporary parking claims: ${statistics.totals.temporaryClaims}`,
      `Overall parking utilization: ${statistics.totals.utilizationPercentage}%`,
      '',
      'Daily utilization',
    ];
    for (const day of statistics.daily) {
      lines.push(
        `  ${day.date}: ${day.utilizedSpaces}/${day.allocatedSpaces} used (${day.utilizationPercentage}%), ` +
          `${day.releasedSpaces} released, ${day.temporaryClaims} claimed`,
      );
    }
    lines.push('', 'Dedicated parking neither released nor utilized');
    lines.push(
      ...(statistics.unusedDedicated.length
        ? statistics.unusedDedicated.map((row) => `  ${row.date} ${row.displayName} <${row.corporateEmail}> ${row.spaceCode ?? ''}`.trimEnd())
        : ['  None']),
    );
    lines.push('', 'Temporary parking claimed but not utilized');
    lines.push(
      ...(statistics.unusedTemporary.length
        ? statistics.unusedTemporary.map((row) => `  ${row.date} ${row.displayName} <${row.corporateEmail}> ${row.spaceCode ?? ''}`.trimEnd())
        : ['  None']),
    );
    lines.push('', 'Phase 1 is monitoring only: no warning, suspension, or penalty has been applied.');
    return lines.join('\n');
  }
}
