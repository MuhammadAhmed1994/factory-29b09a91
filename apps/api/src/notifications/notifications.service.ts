import { Injectable, Logger } from '@nestjs/common';
import { ParkingNotificationType, Prisma } from '@prisma/client';
import { parseCalendarDate } from '../common/office-time';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Availability notifications (US-004). A notification is persisted per eligible employee and
 * delivered to the client, which subscribes for live updates; storing them means a notification is
 * never lost because an employee's device was offline when the space opened.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Notifies every employee without a dedicated space on `date` that parking became available.
   * Employees who already hold an allocation that day are skipped -- they cannot claim again.
   */
  async notifyParkingAvailable(
    date: string,
    availableSpaces: number,
    client?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = client ?? this.prisma;
    const day = parseCalendarDate(date);

    const eligible = await db.employee.findMany({
      where: {
        isActive: true,
        assignments: {
          none: {
            effectiveFrom: { lte: day },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
          },
        },
        allocations: { none: { parkingRelease: { is: { releaseDate: day } } } },
      },
      select: { id: true },
    });
    if (!eligible.length) return 0;

    const body = availableSpaces === 1
      ? '1 parking spot is available to claim today.'
      : `${availableSpaces} parking spots are available to claim today.`;

    const created = await db.parkingNotification.createMany({
      data: eligible.map(({ id }) => ({
        employeeId: id,
        type: ParkingNotificationType.PARKING_AVAILABLE,
        title: 'Parking available',
        body,
        officeDate: day,
      })),
    });
    this.logger.log(`Notified ${created.count} employees that parking is available on ${date}`);
    return created.count;
  }

  async listForEmployee(employeeId: string, unreadOnly = false) {
    return this.prisma.parkingNotification.findMany({
      where: { employeeId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(employeeId: string, id: string): Promise<{ updated: number }> {
    const result = await this.prisma.parkingNotification.updateMany({
      where: { id, employeeId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async markAllRead(employeeId: string): Promise<{ updated: number }> {
    const result = await this.prisma.parkingNotification.updateMany({
      where: { employeeId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
