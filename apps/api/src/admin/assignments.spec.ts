import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { validate } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { REQUIRED_ROLES_KEY } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService, ParkingAssignmentRecord } from './assignments.service';
import { CreateParkingAssignmentDto, UpdateParkingAssignmentDto } from './dto/parking-assignment.dto';

describe('administrator parking assignments', () => {
  it('[AC-7] allows parking administrators to list, create, retrieve, update and remove validated assignments', async () => {
    const record = {
      id: 'assignment-1',
      employeeId: 'employee-1',
      parkingSpaceId: 'space-1',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      effectiveTo: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      employee: { id: 'employee-1' },
      parkingSpace: { id: 'space-1', parkingFloor: { id: 'floor-1' } },
    } as unknown as ParkingAssignmentRecord;
    const findUnique = jest.fn().mockResolvedValue(record);
    const db = {
      parkingAssignment: {
        findMany: jest.fn().mockResolvedValue([record]),
        findUnique,
        create: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue(record),
        delete: jest.fn().mockResolvedValue(record),
      },
    } as unknown as PrismaService;
    const service = new AssignmentsService(db);
    const payload: CreateParkingAssignmentDto = {
      employeeId: 'employee-1',
      parkingSpaceId: 'space-1',
      effectiveFrom: '2026-06-01',
    };

    expect(await service.list()).toEqual([record]);
    expect(await service.create(payload)).toBe(record);
    expect(db.parkingAssignment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        parkingSpaceId: 'space-1',
        effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
        effectiveTo: null,
      }),
      include: expect.any(Object),
    }));
    expect(await service.get('assignment-1')).toBe(record);
    expect(await service.update('assignment-1', {
      effectiveTo: '2026-12-31',
    } satisfies UpdateParkingAssignmentDto)).toBe(record);
    expect(db.parkingAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'assignment-1' },
      data: { effectiveTo: new Date('2026-12-31T00:00:00.000Z') },
    }));
    await expect(service.remove('assignment-1')).resolves.toBeUndefined();

    findUnique.mockResolvedValueOnce(null as unknown as ParkingAssignmentRecord);
    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);

    const invalidDtoErrors = await validate(Object.assign(new CreateParkingAssignmentDto(), {
      employeeId: '',
      parkingSpaceId: '',
      effectiveFrom: 'not-a-date',
    }));
    expect(invalidDtoErrors.map(({ property }) => property).sort()).toEqual([
      'effectiveFrom',
      'employeeId',
      'parkingSpaceId',
    ]);

    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AssignmentsController)).toEqual([
      ParkingRole.PARKING_ADMINISTRATOR,
    ]);
    expect(Reflect.getMetadata('__guards__', AssignmentsController)).toContain(AuthGuard);
    expect(Reflect.getMetadata('__httpCode__', AssignmentsController.prototype.remove)).toBe(204);
    expect(Reflect.getMetadata('__httpCode__', AssignmentsController.prototype.update)).toBe(200);
  });
});
