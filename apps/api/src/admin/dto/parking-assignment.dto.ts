import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Fields used to create a parking assignment. Calendar dates are sent as ISO date strings. */
export class CreateParkingAssignmentDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  parkingSpaceId!: string;

  @IsDateString({ strict: true })
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  effectiveTo?: string | null;
}

/** Fields that may be changed on an existing parking assignment. */
export class UpdateParkingAssignmentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  employeeId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  parkingSpaceId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  effectiveTo?: string | null;
}
