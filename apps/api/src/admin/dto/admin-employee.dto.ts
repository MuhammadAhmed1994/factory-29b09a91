import { IsEmail, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const FOLIO3_EMAIL_PATTERN = /^[^@\s]+@folio3\.com$/i;

/** Fields required when an administrator creates an employee directory record. */
export class CreateAdminEmployeeDto {
  @IsString()
  @Matches(/\S/, { message: 'displayName must not be empty' })
  displayName!: string;

  @IsEmail()
  @Matches(FOLIO3_EMAIL_PATTERN, { message: 'corporateEmail must use the Folio3 corporate domain' })
  corporateEmail!: string;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsString()
  employeeNumber?: string | null;
}

/** Optional fields that can be changed on an employee directory record. */
export class UpdateAdminEmployeeDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'displayName must not be empty' })
  displayName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEmail()
  @Matches(FOLIO3_EMAIL_PATTERN, { message: 'corporateEmail must use the Folio3 corporate domain' })
  corporateEmail?: string;

  @IsOptional()
  @IsString()
  department?: string | null;

  @IsOptional()
  @IsString()
  employeeNumber?: string | null;
}
