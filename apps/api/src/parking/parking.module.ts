import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';

@Module({
  imports: [PrismaModule, NotificationsModule, JwtModule.register({})],
  controllers: [ParkingController],
  providers: [ParkingService, AuthGuard],
  exports: [ParkingService],
})
export class ParkingModule {}
