import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { NotificationsService } from './notifications.service';

/** The signed-in employee's parking notifications. */
@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentEmployee() employee: AuthenticatedEmployee,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.listForEmployee(employee.id, unread === 'true');
  }

  @Patch('read')
  markAllRead(@CurrentEmployee() employee: AuthenticatedEmployee) {
    return this.notifications.markAllRead(employee.id);
  }

  @Patch(':id/read')
  markRead(@CurrentEmployee() employee: AuthenticatedEmployee, @Param('id') id: string) {
    return this.notifications.markRead(employee.id, id);
  }
}
