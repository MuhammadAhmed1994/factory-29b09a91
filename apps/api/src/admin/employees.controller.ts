import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ParkingRole, Employee } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateAdminEmployeeDto, UpdateAdminEmployeeDto } from './dto/admin-employee.dto';
import { EmployeesService } from './employees.service';

/** Administrator-only routes for employee directory records. */
@Controller('admin/employees')
@UseGuards(AuthGuard)
@Roles(ParkingRole.PARKING_ADMINISTRATOR)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async list(@Query('search') search?: string): Promise<Employee[]> {
    return this.employeesService.list(search);
  }

  @Post()
  async create(@Body() input: CreateAdminEmployeeDto): Promise<Employee> {
    return this.employeesService.create(input);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Employee> {
    return this.employeesService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() input: UpdateAdminEmployeeDto): Promise<Employee> {
    return this.employeesService.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.employeesService.remove(id);
  }
}
