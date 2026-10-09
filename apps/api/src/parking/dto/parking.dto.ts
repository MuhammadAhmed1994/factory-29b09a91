import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates submitted when an employee releases a space. The Spec lets a holder pick one date or
 * several from the calendar, so `releaseDates` accepts a list; `releaseDate` remains accepted for
 * a single day.
 */
export class CreateParkingReleaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(CALENDAR_DATE, { message: 'releaseDate must be an ISO calendar date (YYYY-MM-DD)' })
  releaseDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(31, { message: 'releaseDates may cover at most 31 days' })
  @Matches(CALENDAR_DATE, {
    each: true,
    message: 'each value in releaseDates must be an ISO calendar date (YYYY-MM-DD)',
  })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? [...new Set(value)] : value,
  )
  releaseDates?: string[];
}

/** Public release history event returned by the parking API. */
export interface ParkingReleaseStatusChange {
  status: 'OPEN' | 'CLAIMED' | 'CANCELLED';
  changedAt: Date;
  employeeId?: string;
}
