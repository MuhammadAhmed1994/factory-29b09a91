import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateParkingAssignmentDto, UpdateParkingAssignmentDto } from './dto/parking-assignment.dto';
import { PrismaService } from '../prisma/prisma.service';

const assignmentRelations = {
  employee: true,
  parkingSpace: { include: { parkingFloor: true } },
} as const;

/** Assignment data together with the employee, space and floor used by administration screens. */
export type ParkingAssignmentRecord = Prisma.ParkingAssignmentGetPayload<{
  include: typeof assignmentRelations;
}>;

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ParkingAssignmentRecord[]> {
    return this.prisma.parkingAssignment.findMany({
      include: assignmentRelations,
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
    });
  }

  async get(id: string): Promise<ParkingAssignmentRecord> {
    const assignment = await this.prisma.parkingAssignment.findUnique({
      where: { id },
      include: assignmentRelations,
    });
    if (!assignment) throw new NotFoundException('Parking assignment not found');
    return assignment;
  }

  async create(dto: CreateParkingAssignmentDto): Promise<ParkingAssignmentRecord> {
    try {
      return await this.prisma.parkingAssignment.create({
        data: {
          employeeId: dto.employeeId,
          parkingSpaceId: dto.parkingSpaceId,
          effectiveFrom: this.asDate(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? this.asDate(dto.effectiveTo) : null,
        },
        include: assignmentRelations,
      });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async update(id: string, dto: UpdateParkingAssignmentDto): Promise<ParkingAssignmentRecord> {
    try {
      return await this.prisma.parkingAssignment.update({
        where: { id },
        data: {
          ...(dto.employeeId !== undefined ? { employeeId: dto.employeeId } : {}),
          ...(dto.parkingSpaceId !== undefined ? { parkingSpaceId: dto.parkingSpaceId } : {}),
          ...(dto.effectiveFrom !== undefined ? { effectiveFrom: this.asDate(dto.effectiveFrom) } : {}),
          ...(dto.effectiveTo !== undefined
            ? { effectiveTo: dto.effectiveTo === null ? null : this.asDate(dto.effectiveTo) }
            : {}),
        },
        include: assignmentRelations,
      });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.parkingAssignment.delete({ where: { id } });
    } catch (error) {
      this.rethrowPersistenceError(error);
    }
  }

  private asDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private rethrowPersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new NotFoundException('Parking assignment not found');
      if (error.code === 'P2003') {
        throw new BadRequestException({
          message: 'The referenced employee or parking space does not exist',
          fieldErrors: { employeeId: 'Employee or parkingSpaceId is invalid' },
        });
      }
    }
    throw error;
  }
}
