import { IsOptional, IsString, Matches } from 'class-validator';

export class GenerateWeeklyReportDto {
  /** Any date inside the week to report on; defaults to the week that just finished. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart must use YYYY-MM-DD format' })
  weekStart?: string;
}

export class UtilizationQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must use YYYY-MM-DD format' })
  date?: string;
}
