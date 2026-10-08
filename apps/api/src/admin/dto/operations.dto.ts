import { IsEnum, IsString, Matches, ValidateIf } from 'class-validator';

export enum ParkingReportType {
  EMPLOYEES = 'employees',
  ASSIGNMENTS = 'assignments',
  RELEASES = 'releases',
  ALLOCATIONS = 'allocations',
}

export class UpdateParkingConfigurationDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, {
    message: 'dailyParkingReleaseTime must be a valid HH:mm time',
  })
  dailyParkingReleaseTime?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  officeTimeZone?: string;
}

export class ParkingReportQueryDto {
  @IsEnum(ParkingReportType)
  reportType!: ParkingReportType;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must use YYYY-MM-DD format' })
  startDate!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must use YYYY-MM-DD format' })
  endDate!: string;
}
