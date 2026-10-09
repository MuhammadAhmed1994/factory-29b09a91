import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EmployeesModule as AdminEmployeesModule } from './admin/employees.module';
import { AssignmentsModule } from './admin/assignments.module';
import { OperationsModule } from './admin/operations.module';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UtilizationModule } from './utilization/utilization.module';
import { EmployeesModule } from './employees/employees.module';
import { ParkingModule } from './parking/parking.module';
import { PrismaModule } from './prisma/prisma.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    EmployeesModule,
    ParkingModule,
    SecurityModule,
    AssignmentsModule,
    AdminEmployeesModule,
    OperationsModule,
    NotificationsModule,
    UtilizationModule,
  ],
})
export class AppModule {}
