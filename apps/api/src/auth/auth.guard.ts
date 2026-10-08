import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ParkingRole } from '@prisma/client';
import { config } from '../app.config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedEmployee, AuthenticatedRequest } from './current-employee.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { REQUIRED_ROLES_KEY } from './roles.decorator';

interface SessionClaims {
  sub?: string;
  employeeId?: string;
  id?: string;
}

/** Validates the signed session, reloads the active employee and enforces persisted role records. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('A valid employee session is required');

    let claims: SessionClaims;
    try {
      claims = await this.jwtService.verifyAsync<SessionClaims>(token, { secret: config.jwtSecret });
    } catch {
      throw new UnauthorizedException('The employee session is invalid or expired');
    }

    const employeeId = claims.employeeId ?? claims.sub ?? claims.id;
    if (!employeeId || typeof employeeId !== 'string') {
      throw new UnauthorizedException('The employee session has no employee identity');
    }

    const employee: AuthenticatedEmployee | null = await this.prisma.employee.findFirst({
      where: { id: employeeId, isActive: true },
      include: { roles: true },
    });
    if (!employee) throw new UnauthorizedException('The employee session is no longer active');

    request.employee = employee;
    request.user = employee;

    const requiredRoles = this.reflector.getAllAndOverride<ParkingRole[]>(REQUIRED_ROLES_KEY, targets);
    if (requiredRoles?.length && !employee.roles.some(({ role }) => requiredRoles.includes(role))) {
      throw new ForbiddenException('The employee does not have a required role');
    }
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const authorization = request.headers.authorization;
    if (authorization) {
      const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
      if (match) return match[1];
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    const cookies = new Map<string, string>();
    for (const part of cookieHeader.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0) continue;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        cookies.set(name, decodeURIComponent(value));
      } catch {
        // A malformed cookie is ignored; another supported credential may still be valid.
      }
    }
    return cookies.get('parking_session') ?? cookies.get('session') ?? cookies.get('access_token');
  }
}
