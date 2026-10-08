import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ParkingRelease, ParkingReleaseStatus, Prisma } from '@prisma/client';
import { config } from '../app.config';
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
  constructor(private readonly prisma: PrismaService) {}

  async createRelease(employeeId: string, requestedDate: string): Promise<ParkingReleaseResult> {
    const date = this.parseCalendarDate(requestedDate);
    const settings = await this.getSettings();
    const today = this.officeDate(new Date(), settings.timeZone);
    const requested = requestedDate;
    const latest = this.addCalendarDays(today, 30);
    if (requested < today || requested > latest) {
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
    if (assignment.releases.length) throw new ConflictException('A release already exists for this assignment and date');

    const claimableAt = this.officeInstant(requested, settings.releaseTime, settings.timeZone);
    const release = await this.prisma.parkingRelease.create({
      data: { parkingAssignmentId: assignment.id, releaseDate: date, claimableAt },
      include: releaseDetails,
    });
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
      throw new ConflictException('Only an unclaimed release can be cancelled');
    }
    return this.getRelease(employeeId, id);
  }

  async getAvailability(): Promise<ParkingAvailabilityResult[]> {
    const settings = await this.getSettings();
    const now = new Date();
    const today = this.parseCalendarDate(this.officeDate(now, settings.timeZone));
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
    const today = this.parseCalendarDate(this.officeDate(now, settings.timeZone));

    try {
      const claimed = await this.prisma.$transaction(async (transaction) => {
        const release = await transaction.parkingRelease.findUnique({
          where: { id },
          include: releaseDetails,
        });
        if (!release || release.status !== ParkingReleaseStatus.OPEN || release.claimableAt > now || release.releaseDate > today) {
          return null;
        }
        // A holder cannot claim their own release, nor can an employee receive two allocations for one day.
        if (release.parkingAssignment.employeeId === employeeId) return null;
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
      if (error instanceof ConflictException) throw error;
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

  private parseCalendarDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new UnprocessableEntityException('releaseDate must be a valid calendar date');
    }
    return date;
  }

  private officeDate(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  private addCalendarDays(date: string, days: number): string {
    const value = this.parseCalendarDate(date);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  /** Converts an office-local wall-clock timestamp to UTC while respecting the IANA zone/DST. */
  private officeInstant(date: string, time: string, timeZone: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let guess = target;
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(guess));
      const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
      const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
      const delta = target - represented;
      if (delta === 0) break;
      guess += delta;
    }
    return new Date(guess);
  }
}
