import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Google Identity Services ID-token credential exchanged for an API session. */
export class GoogleSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  credential!: string;
}
