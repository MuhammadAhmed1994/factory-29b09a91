import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

/** Employee-editable profile fields; corporate identity fields are deliberately excluded. */
export class UpdateEmployeeProfileDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'displayName must not be empty' })
  displayName?: string;

  @IsOptional()
  @IsString()
  department?: string | null;
}
