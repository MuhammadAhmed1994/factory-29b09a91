import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AssignmentsController, ParkingAssignmentValidationGuard } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AuthGuard, ParkingAssignmentValidationGuard],
})
export class AssignmentsModule {}
