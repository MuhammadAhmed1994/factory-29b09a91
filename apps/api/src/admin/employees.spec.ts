import { validate } from 'class-validator';
import { ParkingRole } from '@prisma/client';
import { EmployeesController } from './employees.controller';
import { CreateAdminEmployeeDto, UpdateAdminEmployeeDto } from './dto/admin-employee.dto';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_ROLES_KEY } from '../auth/roles.decorator';

const employee = {
  id: 'employee-123',
  corporateEmail: 'alex.morgan@folio3.com',
  googleSubject: 'google-subject-123',
  displayName: 'Alex Morgan',
  department: 'Engineering',
  employeeNumber: 'F3-1001',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Administrator employee records', () => {
  it('[AC-7] manages the employee directory with authorized Folio3 identity and unique identity handling', async () => {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([employee]),
        create: jest.fn().mockResolvedValue(employee),
        findUnique: jest.fn().mockResolvedValue(employee),
        update: jest.fn().mockResolvedValue({ ...employee, isActive: false }),
      },
    } as unknown as PrismaService;
    const service = new EmployeesService(prisma);
    const controller = new EmployeesController(service);

    const createDto = Object.assign(new CreateAdminEmployeeDto(), {
      displayName: 'Alex Morgan',
      corporateEmail: 'alex.morgan@folio3.com',
      department: 'Engineering',
      employeeNumber: 'F3-1001',
    });
    const validErrors = await validate(createDto);
    const invalidDto = Object.assign(new CreateAdminEmployeeDto(), {
      displayName: 'Other Employee',
      corporateEmail: 'person@gmail.com',
    });
    const invalidErrors = await validate(invalidDto);

    expect(validErrors).toHaveLength(0);
    expect(invalidErrors.some((error) => error.property === 'corporateEmail')).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, EmployeesController)).toEqual([
      ParkingRole.PARKING_ADMINISTRATOR,
    ]);
    await expect(controller.list('folio3.com')).resolves.toEqual([employee]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: { corporateEmail: { contains: 'folio3.com', mode: 'insensitive' } },
      orderBy: { displayName: 'asc' },
    });
    await expect(controller.create(createDto)).resolves.toEqual(employee);
    expect(prisma.employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        displayName: 'Alex Morgan',
        corporateEmail: 'alex.morgan@folio3.com',
        googleSubject: expect.stringMatching(/^admin-created-/),
      }),
    });
    await expect(controller.findById(employee.id)).resolves.toEqual(employee);
    const updateDto = Object.assign(new UpdateAdminEmployeeDto(), { department: 'Operations' });
    await expect(controller.update(employee.id, updateDto)).resolves.toEqual({ ...employee, isActive: false });
    await expect(controller.remove(employee.id)).resolves.toBeUndefined();
    expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: employee.id }, data: updateDto });
  });
});
