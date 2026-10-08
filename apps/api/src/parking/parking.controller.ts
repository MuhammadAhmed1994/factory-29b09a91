import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { CreateParkingReleaseDto } from './dto/parking.dto';
import { ParkingService } from './parking.service';

/** Authenticated employee routes for releasing and claiming parking spaces. */
@Controller('parking')
@UseGuards(AuthGuard)
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post('releases')
  createRelease(
    @Body() dto: CreateParkingReleaseDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['createRelease']> {
    return this.parkingService.createRelease(employee.id, dto.releaseDate);
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

  @Post('releases/:id/claims')
  claimRelease(
    @Param('id') id: string,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<ParkingService['claimRelease']> {
    return this.parkingService.claimRelease(employee.id, id);
  }
}
