import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EmployeeRole, ParkingRole } from '@prisma/client';

/** The active employee identity and role records loaded for the current request. */
export interface AuthenticatedEmployee {
  id: string;
  corporateEmail: string;
  googleSubject: string;
  displayName: string;
  department: string | null;
  employeeNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: EmployeeRole[];
}

export interface AuthenticatedRequest {
  employee?: AuthenticatedEmployee;
  user?: AuthenticatedEmployee;
  headers: { authorization?: string; cookie?: string };
}

/** Provides the employee context that the authentication guard validated for this request. */
export const CurrentEmployee = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedEmployee => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.employee) {
      throw new Error('CurrentEmployee can only be used on an authenticated route');
    }
    return request.employee;
  },
);

export { ParkingRole };
