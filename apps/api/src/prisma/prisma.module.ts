import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  // API feature modules import PrismaModule to inject the shared Prisma client.
  exports: [PrismaService],
})
export class PrismaModule {}
