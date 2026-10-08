import { Injectable } from '@nestjs/common';
import { ParkingReleaseStatus } from '@prisma/client';
import { config } from '../app.config';
import { PrismaService } from '../prisma/prisma.service';

export type VehicleVerificationOutcome =
  | 'TEMPORARY_ALLOCATION_AUTHORIZED'
  | 'NO_VALID_TEMPORARY_ALLOCATION'
  | 'PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS'
  | 'VEHICLE_NOT_REGISTERED';

/** Explicit office-day decision returned to security for a vehicle verification. */
export interface VehicleVerificationResult {
  vehicleIdentifier: string;
  date: string;
  authorized: boolean | null;
  outcome: VehicleVerificationOutcome;
}

@Injectable()
export class SecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyVehicle(vehicleIdentifier: string): Promise<VehicleVerificationResult> {
    const configuration = await this.prisma.parkingConfiguration.findFirst({
      select: { officeTimeZone: true },
    });
    const officeDate = this.getOfficeDate(new Date(), configuration?.officeTimeZone ?? config.officeTimeZone);
    const date = officeDate.toISOString().slice(0, 10);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vehicleIdentifier },
      select: { employeeId: true, hasPermanentSticker: true },
    });

    if (!vehicle) {
      return {
        vehicleIdentifier,
        date,
        authorized: false,
        outcome: 'VEHICLE_NOT_REGISTERED',
      };
    }

    if (vehicle.hasPermanentSticker) {
      return {
        vehicleIdentifier,
        date,
        // Permanent sticker entry is decided by the existing entrance process, not this API.
        authorized: null,
        outcome: 'PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS',
      };
    }

    const allocation = await this.prisma.parkingAllocation.findFirst({
      where: {
        employeeId: vehicle.employeeId,
        parkingRelease: {
          is: {
            releaseDate: officeDate,
            status: ParkingReleaseStatus.CLAIMED,
          },
        },
      },
      select: { id: true },
    });

    if (allocation) {
      return {
        vehicleIdentifier,
        date,
        authorized: true,
        outcome: 'TEMPORARY_ALLOCATION_AUTHORIZED',
      };
    }

    return {
      vehicleIdentifier,
      date,
      authorized: false,
      outcome: 'NO_VALID_TEMPORARY_ALLOCATION',
    };
  }

  private getOfficeDate(instant: Date, timeZone: string): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const partValue = (type: 'year' | 'month' | 'day'): number => {
      const value = parts.find((part) => part.type === type)?.value;
      if (!value) throw new Error(`Could not determine office-local ${type}`);
      return Number(value);
    };
    return new Date(Date.UTC(partValue('year'), partValue('month') - 1, partValue('day')));
  }
}
