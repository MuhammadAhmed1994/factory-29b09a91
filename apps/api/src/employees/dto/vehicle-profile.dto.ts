import { IsBoolean, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

/** Fields required to register an employee-owned vehicle. */
export class CreateVehicleProfileDto {
  @IsString()
  @Matches(/\S/, { message: 'vehicleIdentifier must not be empty' })
  vehicleIdentifier!: string;

  @IsOptional()
  @IsString()
  make?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;

  @IsBoolean()
  hasPermanentSticker!: boolean;
}

/** Optional editable properties of an employee-owned vehicle. */
export class UpdateVehicleProfileDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'vehicleIdentifier must not be empty' })
  vehicleIdentifier?: string;

  @IsOptional()
  @IsString()
  make?: string | null;

  @IsOptional()
  @IsString()
  model?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  hasPermanentSticker?: boolean;
}
