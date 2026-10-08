import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeesController, EmployeeProfileInputGuard } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [EmployeesController],
  providers: [EmployeesService, AuthGuard, EmployeeProfileInputGuard],
  exports: [EmployeesService],
})
export class EmployeesModule {}
