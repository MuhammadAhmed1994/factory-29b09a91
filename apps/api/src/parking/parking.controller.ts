import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { CreateParkingReleaseDto } from './dto/parking.dto';
import { ParkingService } from './parking.service';

/** Authenticated employee routes for releasing and claiming parking spaces. */
@Controller('parking')
@UseGuards(AuthGuard)
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  /** The employee's home screen: dedicated-space status for today plus current availability. */
  @Get('dashboard')
  getDashboard(@CurrentEmployee() employee: AuthenticatedEmployee): ReturnType<ParkingService['getDashboard']> {
    return this.parkingService.getDashboard(employee.id);
  }

  /**
   * Releases one date or several. A single `releaseDate` returns the created release; a
   * `releaseDates` list returns every release created, so the calendar can schedule in one request.
   */
  @Post('releases')
  async createRelease(
    @Body() dto: CreateParkingReleaseDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ) {
    const dates = dto.releaseDates ?? (dto.releaseDate ? [dto.releaseDate] : []);
    if (!dates.length) {
      throw new UnprocessableEntityException('releaseDate or releaseDates is required');
    }
    const created = await this.parkingService.createReleases(employee.id, dates);
    return dto.releaseDates ? created : created[0];
  }

  @Get('releases')
  listReleases(@CurrentEmployee() employee: AuthenticatedEmployee): ReturnType<ParkingService['listReleases']> {
    return this.parkingService.listReleases(employee.id);
  }

  @Get('releases/:id')
  getRelease(
    @Param('id') id: string,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['getRelease']> {
    return this.parkingService.getRelease(employee.id, id);
  }

  @Delete('releases/:id')
  cancelRelease(
    @Param('id') id: string,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['cancelRelease']> {
    return this.parkingService.cancelRelease(employee.id, id);
  }

  @Get('availability')
  getAvailability(): ReturnType<ParkingService['getAvailability']> {
    return this.parkingService.getAvailability();
  }

  @Get('releases/:id/audit')
  getReleaseAudit(@Param('id') id: string): ReturnType<ParkingService['getReleaseAudit']> {
    return this.parkingService.getReleaseAudit(id);
  }

  /** Claims a space without choosing one; the system allocates and reports the floor. */
  @Post('claims')
  claimNextAvailable(
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['claimNextAvailable']> {
    return this.parkingService.claimNextAvailable(employee.id);
  }

  @Post('releases/:id/claims')
  claimRelease(
    @Param('id') id: string,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['claimRelease']> {
    return this.parkingService.claimRelease(employee.id, id);
  }
}
