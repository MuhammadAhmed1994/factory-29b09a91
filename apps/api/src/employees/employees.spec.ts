import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('employee self-service profile and vehicles', () => {
  it('[AC-8] reads and updates the current employee profile and scopes vehicle CRUD to that employee', async () => {
    const profile = {
      id: 'employee-1',
      corporateEmail: 'employee@folio3.com',
      displayName: 'Employee One',
      department: 'Engineering',
      employeeNumber: 'E-100',
    };
    // The api stores roles as rows; the profile endpoint flattens them because the web resolves
    // which workspace an employee may open from this response.
    const roleRows = [{ role: 'EMPLOYEE' }, { role: 'PARKING_ADMINISTRATOR' }];
    const profileRow = { ...profile, roles: roleRows };
    const profileWithRoles = { ...profile, roles: ['EMPLOYEE', 'PARKING_ADMINISTRATOR'] };
    const vehicle = {
      id: 'vehicle-1',
      vehicleIdentifier: 'ABC-123',
      make: 'Toyota',
      model: 'Corolla',
      hasPermanentSticker: false,
    };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(profileRow),
        update: jest.fn().mockResolvedValue({ ...profileRow, displayName: 'Updated Employee' }),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([vehicle]),
        create: jest.fn().mockResolvedValue(vehicle),
        findFirst: jest.fn().mockResolvedValueOnce({ id: vehicle.id }).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ ...vehicle, model: 'Camry' }),
        deleteMany: jest.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    } as unknown as PrismaService;
    const service = new EmployeesService(prisma);

    expect(await service.getProfile('employee-1')).toEqual(profileWithRoles);
    expect(await service.updateProfile('employee-1', { displayName: 'Updated Employee' })).toMatchObject({
      corporateEmail: 'employee@folio3.com',
      employeeNumber: 'E-100',
      displayName: 'Updated Employee',
      roles: ['EMPLOYEE', 'PARKING_ADMINISTRATOR'],
    });
    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'employee-1' },
      data: { displayName: 'Updated Employee' },
    }));

    expect(await service.listVehicles('employee-1')).toEqual([vehicle]);
    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { employeeId: 'employee-1' } }));
    expect(await service.createVehicle('employee-1', {
      vehicleIdentifier: 'ABC-123', hasPermanentSticker: false,
    })).toEqual(vehicle);
    expect(prisma.vehicle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { vehicleIdentifier: 'ABC-123', hasPermanentSticker: false, employeeId: 'employee-1' },
    }));
    expect(await service.updateVehicle('employee-1', 'vehicle-1', { model: 'Camry' })).toMatchObject({ model: 'Camry' });
    expect(prisma.vehicle.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'vehicle-1', employeeId: 'employee-1' }, select: { id: true },
    });
    await expect(service.updateVehicle('employee-1', 'someone-elses-vehicle', { model: 'Camry' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(1);

    await expect(service.deleteVehicle('employee-1', 'vehicle-1')).resolves.toBeUndefined();
    await expect(service.deleteVehicle('employee-1', 'someone-elses-vehicle'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vehicle.deleteMany).toHaveBeenCalledWith({ where: { id: 'vehicle-1', employeeId: 'employee-1' } });
  });
});
