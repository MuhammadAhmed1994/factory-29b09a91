import { SetMetadata } from '@nestjs/common';
import { ParkingRole } from '@prisma/client';

export const REQUIRED_ROLES_KEY = 'requiredRoles';
export type EmployeeRoleName = ParkingRole;

/** Restricts a route or controller to employees holding any one of the persisted roles. */
export const Roles = (...roles: EmployeeRoleName[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
