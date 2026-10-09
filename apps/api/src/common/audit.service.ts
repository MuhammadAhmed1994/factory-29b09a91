import { Injectable } from '@nestjs/common';
import { ParkingAuditEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  event: ParkingAuditEvent;
  entityType: string;
  entityId: string;
  actorEmployeeId?: string | null;
  detail?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail. Rows are only ever inserted -- a correction is a new event, never an
 * update -- so the history the Spec requires cannot be rewritten by later activity.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, client?: Prisma.TransactionClient): Promise<void> {
    const db = client ?? this.prisma;
    await db.parkingAuditLog.create({
      data: {
        event: entry.event,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorEmployeeId: entry.actorEmployeeId ?? null,
        ...(entry.detail === undefined ? {} : { detail: entry.detail }),
      },
    });
  }

  async listForEntity(entityType: string, entityId: string) {
    return this.prisma.parkingAuditLog.findMany({
      where: { entityType, entityId },
      orderBy: { occurredAt: 'asc' },
    });
  }
}
