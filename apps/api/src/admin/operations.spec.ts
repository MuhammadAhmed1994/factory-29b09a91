import { BadRequestException } from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { REQUIRED_ROLES_KEY } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingReportType } from './dto/operations.dto';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('administrator operations', () => {
  it('[AC-7] administrators can read and update configuration and retrieve bounded reports', async () => {
    const configuration = {
      id: 'config-1',
      dailyParkingReleaseTime: '08:00',
      officeTimeZone: 'UTC',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const updatedConfiguration = { ...configuration, dailyParkingReleaseTime: '09:15' };
    const prisma = {
      parkingConfiguration: {
        findFirst: jest.fn().mockResolvedValueOnce(configuration).mockResolvedValueOnce(configuration),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(updatedConfiguration),
      },
      employee: { findMany: jest.fn().mockResolvedValue([]) },
      parkingAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      parkingRelease: { findMany: jest.fn().mockResolvedValue([]) },
      parkingAllocation: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new OperationsService(prisma);
    const controller = new OperationsController(service, { revertClaimedRelease: jest.fn() } as never);

    await expect(controller.getConfiguration()).resolves.toMatchObject({
      dailyParkingReleaseTime: '08:00',
      officeTimeZone: 'UTC',
    });
    await expect(controller.updateConfiguration({ dailyParkingReleaseTime: '09:15' })).resolves.toMatchObject({
      dailyParkingReleaseTime: '09:15',
    });
    await expect(controller.getReport({
      reportType: ParkingReportType.EMPLOYEES,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })).resolves.toEqual({
      reportType: ParkingReportType.EMPLOYEES,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      data: [],
    });
    await expect(service.getReport({
      reportType: ParkingReportType.RELEASES,
      startDate: '2026-02-01',
      endDate: '2025-01-01',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, OperationsController)).toEqual([
      ParkingRole.PARKING_ADMINISTRATOR,
    ]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2026-02-01T00:00:00.000Z') } },
    }));
  });
});
