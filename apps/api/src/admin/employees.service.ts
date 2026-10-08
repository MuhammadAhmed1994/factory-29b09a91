import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminEmployeeDto, UpdateAdminEmployeeDto } from './dto/admin-employee.dto';

/** Employee-record operations exposed to authorized parking administrators. */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: search ? { corporateEmail: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { displayName: 'asc' },
    });
  }

  async create(input: CreateAdminEmployeeDto): Promise<Employee> {
    try {
      return await this.prisma.employee.create({
        data: {
          ...input,
          googleSubject: `admin-created-${randomUUID()}`,
        },
      });
    } catch (error: unknown) {
      this.rethrowUniqueConflict(error);
    }
  }

  async findById(id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async update(id: string, input: UpdateAdminEmployeeDto): Promise<Employee> {
    await this.findById(id);
    try {
      return await this.prisma.employee.update({ where: { id }, data: input });
    } catch (error: unknown) {
      this.rethrowUniqueConflict(error);
    }
  }

  async remove(id: string): Promise<void> {
    const employee = await this.findById(id);
    if (!employee.isActive) return;
    await this.prisma.employee.update({ where: { id }, data: { isActive: false } });
  }

  private rethrowUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('An employee with that unique identity value already exists');
    }
    throw error;
  }
}
