import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ParkingRole } from '@prisma/client';
import { validate } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { AssignmentsService, ParkingAssignmentRecord } from './assignments.service';
import { CreateParkingAssignmentDto, UpdateParkingAssignmentDto } from './dto/parking-assignment.dto';

interface AssignmentRequest {
  method: string;
  body: unknown;
}

/** Runs DTO validation at the route boundary with the administrator API's 400 error contract. */
@Injectable()
export class ParkingAssignmentValidationGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AssignmentRequest>();
    if (request.method !== 'POST' && request.method !== 'PATCH') return true;
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw new BadRequestException({ message: 'A valid assignment request body is required' });
    }

    const dto = request.method === 'POST'
      ? Object.assign(new CreateParkingAssignmentDto(), request.body)
      : Object.assign(new UpdateParkingAssignmentDto(), request.body);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException(errors);
    return true;
  }
}

@Controller('admin/parking-assignments')
@UseGuards(AuthGuard, ParkingAssignmentValidationGuard)
@Roles(ParkingRole.PARKING_ADMINISTRATOR)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  list(): Promise<ParkingAssignmentRecord[]> {
    return this.assignmentsService.list();
  }

  @Post()
  create(@Body() dto: CreateParkingAssignmentDto): Promise<ParkingAssignmentRecord> {
    return this.assignmentsService.create(dto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  get(@Param('id') id: string): Promise<ParkingAssignmentRecord> {
    return this.assignmentsService.get(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  update(@Param('id') id: string, @Body() dto: UpdateParkingAssignmentDto): Promise<ParkingAssignmentRecord> {
    return this.assignmentsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.assignmentsService.remove(id);
  }
}
