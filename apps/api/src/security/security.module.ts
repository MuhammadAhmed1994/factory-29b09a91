import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityController, VehicleVerificationInputGuard } from './security.controller';
import { SecurityService } from './security.service';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [SecurityController],
  providers: [AuthGuard, VehicleVerificationInputGuard, SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
