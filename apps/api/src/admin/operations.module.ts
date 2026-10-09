import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from '../auth/auth.guard';
import { ParkingModule } from '../parking/parking.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [PrismaModule, ParkingModule, JwtModule.register({})],
  controllers: [OperationsController],
  providers: [OperationsService, AuthGuard],
  exports: [OperationsService],
})
export class OperationsModule {}
