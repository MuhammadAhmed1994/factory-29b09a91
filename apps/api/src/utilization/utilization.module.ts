import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { UtilizationController } from './utilization.controller';
import { UtilizationService } from './utilization.service';
import { WeeklyReportScheduler } from './weekly-report.scheduler';
import { WeeklyReportService } from './weekly-report.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [UtilizationController],
  providers: [AuthGuard, UtilizationService, WeeklyReportService, WeeklyReportScheduler],
  exports: [UtilizationService, WeeklyReportService],
})
export class UtilizationModule {}
