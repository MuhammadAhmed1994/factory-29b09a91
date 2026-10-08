import {
  BadRequestException,
  Controller,
  Get,
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
  constructor(private readonly operationsService: OperationsService) {}

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
