import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

/** Input used to check a registered vehicle at the office entrance. */
export class VehicleVerificationDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  vehicleIdentifier!: string;
}

/**
 * A plate read published by the entrance LPR camera. `objectClass` lets the camera report what it
 * saw; anything other than a car is ignored without a verification, which is how the Spec's
 * "ignore pedestrians, motorcycles and other non-car objects" rule is enforced server-side.
 */
export class LicensePlateDetectionDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  vehicleIdentifier!: string;

  @IsOptional()
  @IsIn(['CAR', 'MOTORCYCLE', 'PEDESTRIAN', 'OTHER'])
  objectClass?: 'CAR' | 'MOTORCYCLE' | 'PEDESTRIAN' | 'OTHER';
}

/** Filter for the entrance activity log. */
export class EntryRecordQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must use YYYY-MM-DD format' })
  date?: string;
}
