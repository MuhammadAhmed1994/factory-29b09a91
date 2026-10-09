import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ParkingAuditEvent, ParkingReleaseStatus, Prisma } from '@prisma/client';
import { config } from '../app.config';
import { AuditService } from '../common/audit.service';
import {
  addCalendarDays,
  officeDate as officeDateOf,
  officeInstant,
  parseCalendarDate,
  toCalendarString,
} from '../common/office-time';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingReleaseStatusChange } from './dto/parking.dto';

const releaseDetails = {
  allocation: { include: { employee: true } },
  parkingAssignment: {
    include: { parkingSpace: { include: { parkingFloor: true } }, employee: true },
  },
} satisfies Prisma.ParkingReleaseInclude;

type ReleaseWithDetails = Prisma.ParkingReleaseGetPayload<{ include: typeof releaseDetails }>;

/** Public representation of a release, including its status history. */
export interface ParkingReleaseResult {
  id: string;
  releaseDate: Date;
  claimableAt: Date;
  status: ParkingReleaseStatus;
  statusChanges: ParkingReleaseStatusChange[];
  allocation?: { employeeId: string; claimant: string; allocatedAt: Date };
  parkingSpace?: { id: string; spaceCode: string; floor: number; floorName: string | null };
}

/** Space advertised by the currently-claimable availability route. */
export interface ParkingAvailabilityResult extends ParkingReleaseResult {}

/** Successful allocation details returned to a winning claimant. */
export interface ParkingClaimResult {
  status: 'CLAIMED';
  claimant: { id: string; displayName: string; corporateEmail: string };
  allocationDate: Date;
  allocatedAt: Date;
  assignedFloor: number;
  spaceCode: string;
}

@Injectable()
export class ParkingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Releases one or more office-local dates, each within the 30-day planning window. */
  async createReleases(employeeId: string, requestedDates: string[]): Promise<ParkingReleaseResult[]> {
    const dates = [...new Set(requestedDates)].sort();
    if (!dates.length) {
      throw new UnprocessableEntityException('At least one release date is required');
    }
    const results: ParkingReleaseResult[] = [];
    // Sequential so an invalid or duplicate date fails the whole request before any later date is
    // written, rather than leaving a partial set of releases behind.
    for (const date of dates) {
      results.push(await this.createRelease(employeeId, date));
    }
    return results;
  }

  async createRelease(employeeId: string, requestedDate: string): Promise<ParkingReleaseResult> {
    const date = parseCalendarDate(requestedDate);
    const settings = await this.getSettings();
    const today = officeDateOf(new Date(), settings.timeZone);
    const latest = addCalendarDays(today, 30);
    if (requestedDate < today || requestedDate > latest) {
      throw new UnprocessableEntityException('releaseDate must be today or within the next 30 days');
    }

    const assignment = await this.prisma.parkingAssignment.findFirst({
      where: {
        employeeId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      include: { releases: { where: { releaseDate: date } } },
    });
    if (!assignment) throw new ConflictException('No parking assignment is active for this date');
    if (assignment.releases.some((release) => release.status !== ParkingReleaseStatus.CANCELLED)) {
      throw new ConflictException('A release already exists for this assignment and date');
    }

    const claimableAt = officeInstant(requestedDate, settings.releaseTime, settings.timeZone);
    const release = await this.prisma.parkingRelease.create({
      data: { parkingAssignmentId: assignment.id, releaseDate: date, claimableAt },
      include: releaseDetails,
    });

    await this.audit.record({
      event: ParkingAuditEvent.RELEASE_SCHEDULED,
      entityType: 'ParkingRelease',
      entityId: release.id,
      actorEmployeeId: employeeId,
      detail: { releaseDate: requestedDate, claimableAt: claimableAt.toISOString() },
    });

    // A space released after the daily release time is claimable right away, so eligible
    // employees are told immediately; a future-dated release notifies when it opens.
    if (claimableAt <= new Date() && requestedDate === today) {
      const available = await this.getAvailability();
      await this.notifications.notifyParkingAvailable(today, available.length);
    }

    return this.toReleaseResult(release);
  }

  async listReleases(employeeId: string): Promise<ParkingReleaseResult[]> {
    const releases = await this.prisma.parkingRelease.findMany({
      where: { parkingAssignment: { employeeId } },
      include: releaseDetails,
      orderBy: [{ releaseDate: 'desc' }, { createdAt: 'desc' }],
    });
    return releases.map((release: ReleaseWithDetails) => this.toReleaseResult(release));
  }

  async getRelease(employeeId: string, id: string): Promise<ParkingReleaseResult> {
    const release = await this.prisma.parkingRelease.findFirst({
      where: { id, parkingAssignment: { employeeId } },
      include: releaseDetails,
    });
    if (!release) throw new NotFoundException('Parking release not found');
    return this.toReleaseResult(release);
  }

  async cancelRelease(employeeId: string, id: string): Promise<ParkingReleaseResult> {
    const result = await this.prisma.parkingRelease.updateMany({
      where: { id, status: ParkingReleaseStatus.OPEN, parkingAssignment: { employeeId } },
      data: { status: ParkingReleaseStatus.CANCELLED, cancelledAt: new Date() },
    });
    if (!result.count) {
      const exists = await this.prisma.parkingRelease.findFirst({
        where: { id, parkingAssignment: { employeeId } },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Parking release not found');
      throw new ConflictException(
        'This release has already been claimed and can only be reverted by a parking administrator',
      );
    }
    await this.audit.record({
      event: ParkingAuditEvent.RELEASE_CANCELLED,
      entityType: 'ParkingRelease',
      entityId: id,
      actorEmployeeId: employeeId,
    });
    return this.getRelease(employeeId, id);
  }

  async getAvailability(): Promise<ParkingAvailabilityResult[]> {
    const settings = await this.getSettings();
    const now = new Date();
    const today = parseCalendarDate(officeDateOf(now, settings.timeZone));
    const releases = await this.prisma.parkingRelease.findMany({
      where: {
        status: ParkingReleaseStatus.OPEN,
        releaseDate: today,
        claimableAt: { lte: now },
      },
      include: releaseDetails,
      orderBy: { createdAt: 'asc' },
    });
    return releases.map((release: ReleaseWithDetails) => this.toReleaseResult(release));
  }

  async claimRelease(employeeId: string, id: string): Promise<ParkingClaimResult> {
    const settings = await this.getSettings();
    const now = new Date();
    const today = parseCalendarDate(officeDateOf(now, settings.timeZone));

    try {
      const claimed = await this.prisma.$transaction(async (transaction) => {
        const release = await transaction.parkingRelease.findUnique({
          where: { id },
          include: releaseDetails,
        });
        if (!release || release.status !== ParkingReleaseStatus.OPEN || release.claimableAt > now || release.releaseDate > today) {
          return null;
        }
        // Temporary spaces exist for employees who have none of their own: anyone holding a dedicated
        // space on this date is ineligible, which also covers claiming back their own release.
        const dedicated = await transaction.parkingAssignment.findFirst({
          where: {
            employeeId,
            effectiveFrom: { lte: release.releaseDate },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: release.releaseDate } }],
          },
          select: { id: true },
        });
        if (dedicated) {
          throw new ForbiddenException('Employees with a dedicated parking space cannot claim a temporary space');
        }
        // An employee may not receive two allocations for one day.
        const alreadyAllocated = await transaction.parkingAllocation.findFirst({
          where: {
            employeeId,
            parkingRelease: { releaseDate: release.releaseDate },
          },
          select: { id: true },
        });
        if (alreadyAllocated) return null;
        const transition = await transaction.parkingRelease.updateMany({
          where: {
            id,
            status: ParkingReleaseStatus.OPEN,
            claimableAt: { lte: now },
            releaseDate: { lte: today },
          },
          data: { status: ParkingReleaseStatus.CLAIMED },
        });
        if (!transition.count) return null;
        const allocation = await transaction.parkingAllocation.create({
          data: { parkingReleaseId: id, employeeId, allocatedAt: now },
          include: { employee: true, parkingRelease: { include: releaseDetails } },
        });
        return allocation;
      });
      if (!claimed) throw new ConflictException('Parking space is unavailable');
      await this.audit.record({
        event: ParkingAuditEvent.RELEASE_CLAIMED,
        entityType: 'ParkingRelease',
        entityId: id,
        actorEmployeeId: employeeId,
        detail: { allocatedAt: claimed.allocatedAt.toISOString() },
      });
      const assignment = claimed.parkingRelease.parkingAssignment;
      const claimant = claimed.employee;
      return {
        status: 'CLAIMED',
        claimant: { id: claimant.id, displayName: claimant.displayName, corporateEmail: claimant.corporateEmail },
        allocationDate: claimed.parkingRelease.releaseDate,
        allocatedAt: claimed.allocatedAt,
        assignedFloor: assignment.parkingSpace.parkingFloor.floorNumber,
        spaceCode: assignment.parkingSpace.spaceCode,
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof ForbiddenException) throw error;
      // Unique allocation constraints can win the race before the conditional transition is observed.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Parking space is unavailable');
      }
      throw error;
    }
  }

  private async getSettings(): Promise<{ releaseTime: string; timeZone: string }> {
    const stored = await this.prisma.parkingConfiguration.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { dailyParkingReleaseTime: true, officeTimeZone: true },
    });
    return {
      releaseTime: stored?.dailyParkingReleaseTime ?? config.dailyParkingReleaseTime,
      timeZone: stored?.officeTimeZone ?? config.officeTimeZone,
    };
  }

  private toReleaseResult(release: ReleaseWithDetails): ParkingReleaseResult {
    const statusChanges: ParkingReleaseStatusChange[] = [
      { status: ParkingReleaseStatus.OPEN, changedAt: release.createdAt },
    ];
    if (release.allocation) {
      statusChanges.push({
        status: ParkingReleaseStatus.CLAIMED,
        changedAt: release.allocation.allocatedAt,
        employeeId: release.allocation.employeeId,
      });
    } else if (release.status === ParkingReleaseStatus.CANCELLED && release.cancelledAt) {
      statusChanges.push({ status: ParkingReleaseStatus.CANCELLED, changedAt: release.cancelledAt });
    }
    return {
      id: release.id,
      releaseDate: release.releaseDate,
      claimableAt: release.claimableAt,
      status: release.status,
      statusChanges,
      ...(release.allocation && {
        allocation: {
          employeeId: release.allocation.employeeId,
          claimant: release.allocation.employee.displayName,
          allocatedAt: release.allocation.allocatedAt,
        },
      }),
      parkingSpace: {
        id: release.parkingAssignment.parkingSpace.id,
        spaceCode: release.parkingAssignment.parkingSpace.spaceCode,
        floor: release.parkingAssignment.parkingSpace.parkingFloor.floorNumber,
        floorName: release.parkingAssignment.parkingSpace.parkingFloor.name,
      },
    };
  }

  /**
   * Claims a space without the employee choosing one (US-004): the system allocates the
   * longest-waiting claimable release and reports the floor it assigned. Races are resolved by
   * trying the next candidate rather than failing the request.
   */
  async claimNextAvailable(employeeId: string): Promise<ParkingClaimResult> {
    const available = await this.getAvailability();
    if (!available.length) throw new ConflictException('No parking spaces are available to claim');
    let lastConflict: unknown;
    for (const release of available) {
      try {
        return await this.claimRelease(employeeId, release.id);
      } catch (error) {
        // A ForbiddenException means this employee may never claim; stop rather than retry.
        if (error instanceof ForbiddenException) throw error;
        if (!(error instanceof ConflictException)) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict instanceof ConflictException
      ? lastConflict
      : new ConflictException('No parking spaces are available to claim');
  }

  /**
   * Administrator override returning a claimed space to its dedicated holder (US-002/US-003): the
   * only route by which a claimed release can be reverted.
   */
  async revertClaimedRelease(administratorId: string, id: string): Promise<ParkingReleaseResult> {
    const release = await this.prisma.parkingRelease.findUnique({
      where: { id },
      include: { allocation: true },
    });
    if (!release) throw new NotFoundException('Parking release not found');
    if (release.status !== ParkingReleaseStatus.CLAIMED) {
      throw new ConflictException('Only a claimed release can be reverted');
    }

    await this.prisma.$transaction(async (transaction) => {
      if (release.allocation) {
        await transaction.parkingAllocation.delete({ where: { id: release.allocation.id } });
      }
      await transaction.parkingRelease.update({
        where: { id },
        data: { status: ParkingReleaseStatus.CANCELLED, cancelledAt: new Date() },
      });
    });

    await this.audit.record({
      event: ParkingAuditEvent.RELEASE_REVERTED_BY_ADMINISTRATOR,
      entityType: 'ParkingRelease',
      entityId: id,
      actorEmployeeId: administratorId,
      detail: {
        previousClaimantId: release.allocation?.employeeId ?? null,
        releaseDate: toCalendarString(release.releaseDate),
      },
    });

    const reverted = await this.prisma.parkingRelease.findUniqueOrThrow({
      where: { id },
      include: releaseDetails,
    });
    return this.toReleaseResult(reverted);
  }

  /** Releases on an office-local date, for the administrator's revert view. */
  async listReleasesForDate(date?: string): Promise<ParkingReleaseResult[]> {
    const settings = await this.getSettings();
    const day = parseCalendarDate(date ?? officeDateOf(new Date(), settings.timeZone));
    const releases = await this.prisma.parkingRelease.findMany({
      where: { releaseDate: day },
      include: releaseDetails,
      orderBy: { createdAt: 'asc' },
    });
    return releases.map((release: ReleaseWithDetails) => this.toReleaseResult(release));
  }

  /** Immutable audit history for a release. */
  async getReleaseAudit(id: string) {
    return this.audit.listForEntity('ParkingRelease', id);
  }

  /** Releases claimable right now, and the holder's own status for the day (US-002 home screen). */
  async getDashboard(employeeId: string) {
    const settings = await this.getSettings();
    const today = officeDateOf(new Date(), settings.timeZone);
    const day = parseCalendarDate(today);

    const [assignment, allocation, available] = await Promise.all([
      this.prisma.parkingAssignment.findFirst({
        where: {
          employeeId,
          effectiveFrom: { lte: day },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
        },
        include: {
          parkingSpace: { include: { parkingFloor: true } },
          releases: { where: { releaseDate: day }, include: { allocation: { include: { employee: true } } } },
        },
      }),
      this.prisma.parkingAllocation.findFirst({
        where: { employeeId, parkingRelease: { is: { releaseDate: day } } },
        include: {
          parkingRelease: {
            include: { parkingAssignment: { include: { parkingSpace: { include: { parkingFloor: true } } } } },
          },
        },
      }),
      this.getAvailability(),
    ]);

    const release = assignment?.releases.find((item) => item.status !== ParkingReleaseStatus.CANCELLED);
    const dedicatedStatus = !assignment
      ? 'NONE'
      : release?.status === ParkingReleaseStatus.CLAIMED
        ? 'CLAIMED_BY_ANOTHER_EMPLOYEE'
        : release
          ? 'RELEASED'
          : 'RESERVED';

    return {
      officeDate: today,
      dailyParkingReleaseTime: settings.releaseTime,
      officeTimeZone: settings.timeZone,
      hasDedicatedParking: Boolean(assignment),
      dedicatedStatus,
      dedicatedSpace: assignment
        ? {
            spaceCode: assignment.parkingSpace.spaceCode,
            floor: assignment.parkingSpace.parkingFloor.floorNumber,
            floorName: assignment.parkingSpace.parkingFloor.name,
          }
        : null,
      todaysRelease: release
        ? {
            id: release.id,
            status: release.status,
            claimableAt: release.claimableAt,
            claimant: release.allocation?.employee.displayName ?? null,
          }
        : null,
      temporaryAllocation: allocation
        ? {
            spaceCode: allocation.parkingRelease.parkingAssignment.parkingSpace.spaceCode,
            floor: allocation.parkingRelease.parkingAssignment.parkingSpace.parkingFloor.floorNumber,
            allocatedAt: allocation.allocatedAt,
          }
        : null,
      availableSpaces: available.length,
    };
  }
}
