import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { Roles } from '../auth/roles.decorator';
import {
  EntryRecordQueryDto,
  LicensePlateDetectionDto,
  VehicleVerificationDto,
} from './dto/vehicle-verification.dto';
import { SecurityService, VehicleVerificationResult } from './security.service';

/** Converts malformed verification payloads into the endpoint's documented 400 response. */
@Injectable()
export class VehicleVerificationInputGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getHandler().name !== 'verifyVehicle') return true;
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    const body = request.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('vehicleIdentifier' in body) ||
      typeof body.vehicleIdentifier !== 'string' ||
      body.vehicleIdentifier.trim().length === 0
    ) {
      throw new BadRequestException('vehicleIdentifier must be a non-empty string');
    }
    return true;
  }
}

/** Result returned to the entrance controller for an automated plate read. */
export interface LicensePlateDetectionResult {
  processed: boolean;
  indicator: 'GREEN' | 'OFF';
  verification?: VehicleVerificationResult;
  ignoredReason?: string;
}

@Controller('security')
@UseGuards(AuthGuard, VehicleVerificationInputGuard)
@Roles(ParkingRole.SECURITY_GUARD)
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('vehicle-verifications')
  verifyVehicle(
    @Body() dto: VehicleVerificationDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): Promise<VehicleVerificationResult> {
    return this.securityService.verifyVehicle(dto.vehicleIdentifier, {
      source: 'SECURITY_DESK',
      actorEmployeeId: employee.id,
    });
  }

  /**
   * Ingestion endpoint for the entrance LPR camera. The camera posts each detection; non-car
   * objects are acknowledged and ignored, and the response carries the indicator-light state the
   * entrance hardware must display.
   */
  @Post('plate-detections')
  async recordDetection(
    @Body() dto: LicensePlateDetectionDto,
  ): Promise<LicensePlateDetectionResult> {
    const objectClass = dto.objectClass ?? 'CAR';
    if (objectClass !== 'CAR') {
      return {
        processed: false,
        indicator: 'OFF',
        ignoredReason: `Detected object is a ${objectClass.toLowerCase()}, not a car`,
      };
    }
    const verification = await this.securityService.verifyVehicle(dto.vehicleIdentifier, {
      source: 'LPR_CAMERA',
    });
    return { processed: true, indicator: verification.indicator, verification };
  }

  /** Entrance activity log: every verification attempt, authorized or not. */
  @Get('entry-records')
  listEntryRecords(@Query() query: EntryRecordQueryDto) {
    return this.securityService.listEntryRecords(query.date);
  }
}
