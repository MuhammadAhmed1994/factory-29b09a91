import { Injectable, Logger } from '@nestjs/common';
import {
  ParkingReleaseStatus,
  ParkingUtilizationOutcome,
  Prisma,
} from '@prisma/client';
import { config } from '../app.config';
import {
  addCalendarDays,
  eachCalendarDay,
  officeDate,
  parseCalendarDate,
  toCalendarString,
  weekBounds,
} from '../common/office-time';
import { PrismaService } from '../prisma/prisma.service';

export interface UtilizationStatistics {
  weekStart: string;
  weekEnd: string;
  unusedDedicated: Array<{ employeeId: string; displayName: string; corporateEmail: string; date: string; spaceCode: string | null }>;
  unusedTemporary: Array<{ employeeId: string; displayName: string; corporateEmail: string; date: string; spaceCode: string | null }>;
  daily: Array<{
    date: string;
    allocatedSpaces: number;
    utilizedSpaces: number;
    releasedSpaces: number;
    temporaryClaims: number;
    utilizationPercentage: number;
  }>;
  totals: {
    releasedSpaces: number;
    temporaryClaims: number;
    allocatedSpaces: number;
    utilizedSpaces: number;
    utilizationPercentage: number;
  };
}

/**
 * Derives parking utilization from entrance records (US-006). A space counts as used only when the
 * holder's registered vehicle was detected entering on that date; the absence of an entry record is
 * what makes an allocation "unused". Phase 1 only records and reports -- nothing is enforced.
 */
@Injectable()
export class UtilizationService {
  private readonly logger = new Logger(UtilizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async officeToday(): Promise<string> {
    const configuration = await this.prisma.parkingConfiguration.findFirst({
      select: { officeTimeZone: true },
    });
    return officeDate(new Date(), configuration?.officeTimeZone ?? config.officeTimeZone);
  }

  /**
   * Records one utilization event per employee holding parking on `date`, for both dedicated
   * holders who did not release and employees who claimed a temporary space.
   */
  async recordForDate(date: string): Promise<{ date: string; recorded: number }> {
    const day = parseCalendarDate(date);
    const nextDay = parseCalendarDate(addCalendarDays(date, 1));

    const [assignments, allocations, entries] = await Promise.all([
      this.prisma.parkingAssignment.findMany({
        where: {
          effectiveFrom: { lte: day },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        },
        include: {
          employee: { include: { vehicles: { select: { id: true } } } },
          parkingSpace: { select: { spaceCode: true } },
          releases: { where: { releaseDate: day } },
        },
      }),
      this.prisma.parkingAllocation.findMany({
        where: { parkingRelease: { is: { releaseDate: day, status: ParkingReleaseStatus.CLAIMED } } },
        include: {
          employee: { include: { vehicles: { select: { id: true } } } },
          parkingRelease: {
            include: { parkingAssignment: { include: { parkingSpace: { select: { spaceCode: true } } } } },
          },
        },
      }),
      this.prisma.vehicleEntryRecord.findMany({
        where: { officeDate: { gte: day, lt: nextDay }, entryGranted: true },
        select: { employeeId: true },
      }),
    ]);

    const entered = new Set(entries.map(({ employeeId }) => employeeId).filter(Boolean) as string[]);
    const rows: Prisma.ParkingUtilizationEventCreateManyInput[] = [];

    for (const assignment of assignments) {
      // A holder who released the space is not expected to turn up; only an unreleased,
      // unused dedicated space is reportable.
      const released = assignment.releases.some(
        (release) => release.status !== ParkingReleaseStatus.CANCELLED,
      );
      if (released) continue;
      rows.push({
        employeeId: assignment.employeeId,
        vehicleId: assignment.employee.vehicles[0]?.id ?? null,
        officeDate: day,
        spaceCode: assignment.parkingSpace.spaceCode,
        outcome: entered.has(assignment.employeeId)
          ? ParkingUtilizationOutcome.DEDICATED_UTILIZED
          : ParkingUtilizationOutcome.DEDICATED_UNUSED,
      });
    }

    for (const allocation of allocations) {
      rows.push({
        employeeId: allocation.employeeId,
        vehicleId: allocation.employee.vehicles[0]?.id ?? null,
        officeDate: day,
        spaceCode: allocation.parkingRelease.parkingAssignment.parkingSpace.spaceCode,
        outcome: entered.has(allocation.employeeId)
          ? ParkingUtilizationOutcome.TEMPORARY_UTILIZED
          : ParkingUtilizationOutcome.TEMPORARY_UNUSED,
      });
    }

    // Recomputing a day replaces its events so a re-run after late entrance data stays correct.
    await this.prisma.$transaction([
      this.prisma.parkingUtilizationEvent.deleteMany({ where: { officeDate: day } }),
      this.prisma.parkingUtilizationEvent.createMany({ data: rows, skipDuplicates: true }),
    ]);
    return { date, recorded: rows.length };
  }

  /** Computes the week's statistics, recording utilization for each day first. */
  async buildStatistics(weekStartDate: string): Promise<UtilizationStatistics> {
    const { weekStart, weekEnd } = weekBounds(weekStartDate);
    for (const day of eachCalendarDay(weekStart, weekEnd)) {
      await this.recordForDate(day);
    }

    const events = await this.prisma.parkingUtilizationEvent.findMany({
      where: {
        officeDate: { gte: parseCalendarDate(weekStart), lte: parseCalendarDate(weekEnd) },
      },
      include: { employee: { select: { id: true, displayName: true, corporateEmail: true } } },
      orderBy: [{ officeDate: 'asc' }, { employeeId: 'asc' }],
    });

    const releases = await this.prisma.parkingRelease.findMany({
      where: {
        releaseDate: { gte: parseCalendarDate(weekStart), lte: parseCalendarDate(weekEnd) },
        status: { not: ParkingReleaseStatus.CANCELLED },
      },
      select: { releaseDate: true, status: true },
    });

    const describe = (event: (typeof events)[number]) => ({
      employeeId: event.employeeId,
      displayName: event.employee.displayName,
      corporateEmail: event.employee.corporateEmail,
      date: toCalendarString(event.officeDate),
      spaceCode: event.spaceCode,
    });

    const unusedDedicated = events
      .filter(({ outcome }) => outcome === ParkingUtilizationOutcome.DEDICATED_UNUSED)
      .map(describe);
    const unusedTemporary = events
      .filter(({ outcome }) => outcome === ParkingUtilizationOutcome.TEMPORARY_UNUSED)
      .map(describe);

    const daily = eachCalendarDay(weekStart, weekEnd).map((date) => {
      const dayEvents = events.filter((event) => toCalendarString(event.officeDate) === date);
      const allocatedSpaces = dayEvents.length;
      const utilizedSpaces = dayEvents.filter(({ outcome }) =>
        outcome === ParkingUtilizationOutcome.DEDICATED_UTILIZED ||
        outcome === ParkingUtilizationOutcome.TEMPORARY_UTILIZED,
      ).length;
      const dayReleases = releases.filter((release) => toCalendarString(release.releaseDate) === date);
      return {
        date,
        allocatedSpaces,
        utilizedSpaces,
        releasedSpaces: dayReleases.length,
        temporaryClaims: dayReleases.filter(({ status }) => status === ParkingReleaseStatus.CLAIMED).length,
        utilizationPercentage: allocatedSpaces ? Math.round((utilizedSpaces / allocatedSpaces) * 1000) / 10 : 0,
      };
    });

    const allocatedSpaces = daily.reduce((sum, day) => sum + day.allocatedSpaces, 0);
    const utilizedSpaces = daily.reduce((sum, day) => sum + day.utilizedSpaces, 0);

    return {
      weekStart,
      weekEnd,
      unusedDedicated,
      unusedTemporary,
      daily,
      totals: {
        releasedSpaces: daily.reduce((sum, day) => sum + day.releasedSpaces, 0),
        temporaryClaims: daily.reduce((sum, day) => sum + day.temporaryClaims, 0),
        allocatedSpaces,
        utilizedSpaces,
        utilizationPercentage: allocatedSpaces
          ? Math.round((utilizedSpaces / allocatedSpaces) * 1000) / 10
          : 0,
      },
    };
  }
}
