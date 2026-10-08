import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

/** Input used to check a registered vehicle at the office entrance. */
export class VehicleVerificationDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  vehicleIdentifier!: string;
}
