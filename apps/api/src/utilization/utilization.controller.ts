import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { GenerateWeeklyReportDto, UtilizationQueryDto } from './dto/utilization.dto';
import { UtilizationService } from './utilization.service';
import { WeeklyReportService } from './weekly-report.service';

/** Administrator view of parking utilization and the weekly report (US-006). */
@Controller('admin/utilization')
@UseGuards(AuthGuard)
@Roles(ParkingRole.PARKING_ADMINISTRATOR)
export class UtilizationController {
  constructor(
    private readonly utilization: UtilizationService,
    private readonly weeklyReport: WeeklyReportService,
  ) {}

  /** Current statistics for the week containing `date` (default: this week). */
  @Get()
  async getUtilization(@Query() query: UtilizationQueryDto) {
    const date = query.date ?? (await this.utilization.officeToday());
    return this.utilization.buildStatistics(date);
  }

  /** Captures utilization for a single day from that day's entrance records. */
  @Post('captures')
  async capture(@Query() query: UtilizationQueryDto) {
    const date = query.date ?? (await this.utilization.officeToday());
    return this.utilization.recordForDate(date);
  }

  @Get('weekly-reports')
  listReports() {
    return this.weeklyReport.listReports();
  }

  /** Generates (and emails) the report on demand; the scheduler does this every Monday. */
  @Post('weekly-reports')
  async generateReport(@Body() dto: GenerateWeeklyReportDto) {
    const today = await this.utilization.officeToday();
    const weekStart = dto.weekStart ?? this.weeklyReport.previousWeek(today).weekStart;
    return this.weeklyReport.generateForWeek(weekStart);
  }
}
