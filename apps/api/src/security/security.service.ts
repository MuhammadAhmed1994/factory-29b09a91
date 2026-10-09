import { Injectable } from '@nestjs/common';
import { ParkingAuditEvent, ParkingReleaseStatus, VehicleVerificationOutcome } from '@prisma/client';
import { config } from '../app.config';
import { AuditService } from '../common/audit.service';
import { officeDate, parseCalendarDate } from '../common/office-time';
import { PrismaService } from '../prisma/prisma.service';

export type { VehicleVerificationOutcome };

/** Explicit office-day decision returned to security for a vehicle verification. */
export interface VehicleVerificationResult {
  vehicleIdentifier: string;
  date: string;
  authorized: boolean | null;
  outcome: VehicleVerificationOutcome;
  /** What the entrance indicator light must show: green only for a valid temporary allocation. */
  indicator: 'GREEN' | 'OFF';
  /** Whether this verification admitted the vehicle through the barrier. */
  entryGranted: boolean;
  recordId: string;
}

export interface VerificationSource {
  /** SECURITY_DESK for a guard lookup, LPR_CAMERA for an automated plate read. */
  source?: string;
  actorEmployeeId?: string | null;
}

@Injectable()
export class SecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async verifyVehicle(
    vehicleIdentifier: string,
    context: VerificationSource = {},
  ): Promise<VehicleVerificationResult> {
    const configuration = await this.prisma.parkingConfiguration.findFirst({
      select: { officeTimeZone: true },
    });
    const date = officeDate(new Date(), configuration?.officeTimeZone ?? config.officeTimeZone);
    const day = parseCalendarDate(date);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vehicleIdentifier },
      select: { id: true, employeeId: true, hasPermanentSticker: true },
    });

    const decision = await this.decide(vehicle, day);

    // Every attempt is recorded -- authorized or not -- because the Spec requires a complete
    // entrance audit trail and the utilization report infers usage from the absence of a record.
    const record = await this.prisma.vehicleEntryRecord.create({
      data: {
        vehicleIdentifier,
        vehicleId: vehicle?.id ?? null,
        employeeId: vehicle?.employeeId ?? null,
        officeDate: day,
        outcome: decision.outcome,
        authorized: decision.authorized,
        entryGranted: decision.entryGranted,
        source: context.source ?? 'SECURITY_DESK',
      },
      select: { id: true },
    });

    await this.audit.record({
      event: ParkingAuditEvent.VEHICLE_VERIFIED,
      entityType: 'VehicleEntryRecord',
      entityId: record.id,
      actorEmployeeId: context.actorEmployeeId ?? null,
      detail: {
        vehicleIdentifier,
        outcome: decision.outcome,
        entryGranted: decision.entryGranted,
        source: context.source ?? 'SECURITY_DESK',
      },
    });

    return {
      vehicleIdentifier,
      date,
      authorized: decision.authorized,
      outcome: decision.outcome,
      indicator: decision.entryGranted && decision.authorized === true ? 'GREEN' : 'OFF',
      entryGranted: decision.entryGranted,
      recordId: record.id,
    };
  }

  private async decide(
    vehicle: { employeeId: string; hasPermanentSticker: boolean } | null,
    day: Date,
  ): Promise<{ outcome: VehicleVerificationOutcome; authorized: boolean | null; entryGranted: boolean }> {
    if (!vehicle) {
      return {
        outcome: VehicleVerificationOutcome.VEHICLE_NOT_REGISTERED,
        authorized: false,
        entryGranted: false,
      };
    }

    if (vehicle.hasPermanentSticker) {
      return {
        // Permanent sticker entry is decided by the existing entrance process, not this API, so the
        // vehicle is admitted and recorded as present without a system authorization decision.
        outcome: VehicleVerificationOutcome.PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS,
        authorized: null,
        entryGranted: true,
      };
    }

    const allocation = await this.prisma.parkingAllocation.findFirst({
      where: {
        employeeId: vehicle.employeeId,
        parkingRelease: { is: { releaseDate: day, status: ParkingReleaseStatus.CLAIMED } },
      },
      select: { id: true },
    });

    return allocation
      ? {
          outcome: VehicleVerificationOutcome.TEMPORARY_ALLOCATION_AUTHORIZED,
          authorized: true,
          entryGranted: true,
        }
      : {
          outcome: VehicleVerificationOutcome.NO_VALID_TEMPORARY_ALLOCATION,
          authorized: false,
          entryGranted: false,
        };
  }

  /** Entrance activity for a day, newest first -- the audit view the Spec requires. */
  async listEntryRecords(date?: string) {
    const configuration = await this.prisma.parkingConfiguration.findFirst({
      select: { officeTimeZone: true },
    });
    const day = parseCalendarDate(
      date ?? officeDate(new Date(), configuration?.officeTimeZone ?? config.officeTimeZone),
    );
    return this.prisma.vehicleEntryRecord.findMany({
      where: { officeDate: day },
      orderBy: { detectedAt: 'desc' },
      include: { employee: { select: { id: true, displayName: true, corporateEmail: true } } },
    });
  }
}
