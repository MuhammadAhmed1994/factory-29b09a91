import { IsNotEmpty, IsString, Matches } from 'class-validator';

/** Validated office-local calendar date submitted when an employee releases a space. */
export class CreateParkingReleaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'releaseDate must be an ISO calendar date (YYYY-MM-DD)' })
  releaseDate!: string;
}

/** Public release history event returned by the parking API. */
export interface ParkingReleaseStatusChange {
  status: 'OPEN' | 'CLAIMED' | 'CANCELLED';
  changedAt: Date;
  employeeId?: string;
}
