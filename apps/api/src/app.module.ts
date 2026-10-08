import { Module } from '@nestjs/common';
import { EmployeesModule as AdminEmployeesModule } from './admin/employees.module';
import { AssignmentsModule } from './admin/assignments.module';
import { OperationsModule } from './admin/operations.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { ParkingModule } from './parking/parking.module';
import { PrismaModule } from './prisma/prisma.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    EmployeesModule,
    ParkingModule,
    SecurityModule,
    AssignmentsModule,
    AdminEmployeesModule,
    OperationsModule,
  ],
})
export class AppModule {}
