import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { VehicleVerificationDto } from './dto/vehicle-verification.dto';
import { SecurityService, VehicleVerificationResult } from './security.service';

/** Converts malformed verification payloads into the endpoint's documented 400 response. */
@Injectable()
export class VehicleVerificationInputGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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

@Controller('security')
@UseGuards(AuthGuard, VehicleVerificationInputGuard)
@Roles(ParkingRole.SECURITY_GUARD)
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('vehicle-verifications')
  verifyVehicle(@Body() dto: VehicleVerificationDto): Promise<VehicleVerificationResult> {
    return this.securityService.verifyVehicle(dto.vehicleIdentifier);
  }
}
