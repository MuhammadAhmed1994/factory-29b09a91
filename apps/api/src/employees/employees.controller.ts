import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { AuthenticatedEmployee, CurrentEmployee } from '../auth/current-employee.decorator';
import { CreateVehicleProfileDto, UpdateVehicleProfileDto } from './dto/vehicle-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/employee-profile.dto';
import { EmployeesService } from './employees.service';

/** Ensures this feature's invalid DTOs use the endpoint contract's 400 response. */
@Injectable()
export class EmployeeProfileInputGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ body?: unknown }>();
    const method = context.getHandler().name;
    let dtoType: ClassConstructor<object> | undefined;
    if (method === 'updateProfile') dtoType = UpdateEmployeeProfileDto;
    else if (method === 'createVehicle') dtoType = CreateVehicleProfileDto;
    else if (method === 'updateVehicle') dtoType = UpdateVehicleProfileDto;
    if (!dtoType) return true;

    if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
      throw new BadRequestException('A valid request body is required');
    }
    const errors = validateSync(plainToInstance(dtoType, request.body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) throw new BadRequestException(errors);
    return true;
  }
}

/** Self-service employee profile and employee-owned vehicle endpoints. */
@Controller('employees/me')
@UseGuards(AuthGuard, EmployeeProfileInputGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  getProfile(@CurrentEmployee() employee: AuthenticatedEmployee): ReturnType<EmployeesService['getProfile']> {
    return this.employeesService.getProfile(employee.id);
  }

  @Patch()
  updateProfile(
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<EmployeesService['updateProfile']> {
    return this.employeesService.updateProfile(employee.id, dto);
  }

  @Get('vehicles')
  listVehicles(@CurrentEmployee() employee: AuthenticatedEmployee): ReturnType<EmployeesService['listVehicles']> {
    return this.employeesService.listVehicles(employee.id);
  }

  @Post('vehicles')
  createVehicle(
    @Body() dto: CreateVehicleProfileDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<EmployeesService['createVehicle']> {
    return this.employeesService.createVehicle(employee.id, dto);
  }

  @Patch('vehicles/:id')
  updateVehicle(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleProfileDto,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<EmployeesService['updateVehicle']> {
    return this.employeesService.updateVehicle(employee.id, id, dto);
  }

  @Delete('vehicles/:id')
  deleteVehicle(
    @Param('id') id: string,
    @CurrentEmployee() employee: AuthenticatedEmployee,
  ): ReturnType<EmployeesService['deleteVehicle']> {
    return this.employeesService.deleteVehicle(employee.id, id);
  }
}
