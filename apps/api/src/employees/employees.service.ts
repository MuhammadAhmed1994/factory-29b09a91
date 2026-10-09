import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Employee, ParkingRole, Prisma, Vehicle } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmployeeProfileDto } from './dto/employee-profile.dto';
import { CreateVehicleProfileDto, UpdateVehicleProfileDto } from './dto/vehicle-profile.dto';

/** Public profile data deliberately excludes immutable identity and authentication fields. */
export type EmployeeProfile = Pick<Employee, 'id' | 'corporateEmail' | 'displayName' | 'department' | 'employeeNumber'> & {
  // The web resolves which workspace an employee may open from this field, so the profile the
  // session reads must carry the same granted roles the sign-in response returns.
  roles: ParkingRole[];
};

/** Public vehicle profile data for the authenticated employee. */
export type VehicleProfile = Pick<Vehicle, 'id' | 'vehicleIdentifier' | 'make' | 'model' | 'color' | 'hasPermanentSticker'>;

/** Profile and vehicle operations scoped to the authenticated employee's persisted identity. */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(employeeId: string): Promise<EmployeeProfile> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        corporateEmail: true,
        displayName: true,
        department: true,
        employeeNumber: true,
        roles: { select: { role: true } },
      },
    });
    if (!employee) throw new NotFoundException('Employee profile not found');
    const { roles, ...profile } = employee;
    return { ...profile, roles: roles.map(({ role }) => role) };
  }

  async updateProfile(employeeId: string, input: UpdateEmployeeProfileDto): Promise<EmployeeProfile> {
    const employee = await this.prisma.employee.update({
      where: { id: employeeId },
      data: input,
      select: {
        id: true,
        corporateEmail: true,
        displayName: true,
        department: true,
        employeeNumber: true,
        roles: { select: { role: true } },
      },
    });
    const { roles, ...profile } = employee;
    return { ...profile, roles: roles.map(({ role }) => role) };
  }

  async listVehicles(employeeId: string): Promise<VehicleProfile[]> {
    return this.prisma.vehicle.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, vehicleIdentifier: true, make: true, model: true, color: true, hasPermanentSticker: true },
    });
  }

  async createVehicle(employeeId: string, input: CreateVehicleProfileDto): Promise<VehicleProfile> {
    try {
      return await this.prisma.vehicle.create({
        // A sticker is an office-issued fact; absent from the payload it defaults to false.
        data: { ...input, hasPermanentSticker: input.hasPermanentSticker ?? false, employeeId },
        select: { id: true, vehicleIdentifier: true, make: true, model: true, color: true, hasPermanentSticker: true },
      });
    } catch (error: unknown) {
      this.rethrowUniqueConflict(error);
    }
  }

  async updateVehicle(employeeId: string, vehicleId: string, input: UpdateVehicleProfileDto): Promise<VehicleProfile> {
    const ownedVehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, employeeId },
      select: { id: true },
    });
    if (!ownedVehicle) throw new NotFoundException('Vehicle not found');

    try {
      return await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: input,
        select: { id: true, vehicleIdentifier: true, make: true, model: true, color: true, hasPermanentSticker: true },
      });
    } catch (error: unknown) {
      this.rethrowUniqueConflict(error);
    }
  }

  async deleteVehicle(employeeId: string, vehicleId: string): Promise<void> {
    const result = await this.prisma.vehicle.deleteMany({ where: { id: vehicleId, employeeId } });
    if (result.count === 0) throw new NotFoundException('Vehicle not found');
  }

  private rethrowUniqueConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A vehicle with that identifier already exists');
    }
    throw error;
  }
}
