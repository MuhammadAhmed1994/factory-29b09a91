import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Body,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { ParkingService } from '../parking/parking.service';
import { ParkingReportQueryDto, UpdateParkingConfigurationDto } from './dto/operations.dto';
import { OperationsService, ParkingConfigurationResult, ParkingReportResult } from './operations.service';

@Controller('admin')
@UseGuards(AuthGuard)
@Roles(ParkingRole.PARKING_ADMINISTRATOR)
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => new BadRequestException(errors),
}))
export class OperationsController {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly parkingService: ParkingService,
  ) {}

  /** Releases on a date (default today), including who claimed each one. */
  @Get('parking-releases')
  listParkingReleases(@Query('date') date?: string): ReturnType<ParkingService['listReleasesForDate']> {
    return this.parkingService.listReleasesForDate(date);
  }

  /**
   * Returns a claimed space to its dedicated holder. The Spec makes this the only way a claimed
   * release can be reverted, which is the "administrator intervention" employees are told about.
   */
  @Delete('parking-releases/:id/claim')
  revertClaimedRelease(
    @Param('id') id: string,
    @CurrentEmployee() administrator: AuthenticatedEmployee,
  ): ReturnType<ParkingService['revertClaimedRelease']> {
    return this.parkingService.revertClaimedRelease(administrator.id, id);
  }

  @Get('configuration')
  getConfiguration(): Promise<ParkingConfigurationResult> {
    return this.operationsService.getConfiguration();
  }

  @Patch('configuration')
  updateConfiguration(@Body() body: UpdateParkingConfigurationDto): Promise<ParkingConfigurationResult> {
    return this.operationsService.updateConfiguration(body);
  }

  @Get('reports')
  getReport(@Query() query: ParkingReportQueryDto): Promise<ParkingReportResult> {
    return this.operationsService.getReport(query);
  }
}
