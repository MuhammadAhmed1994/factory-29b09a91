import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './audit.service';
import { MailerService } from './mailer.service';

/** Cross-cutting services (audit trail, outbound mail) shared by every feature module. */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, MailerService],
  exports: [AuditService, MailerService],
})
export class CommonModule {}
