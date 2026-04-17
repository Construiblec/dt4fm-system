import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateCleaningTaskDto {
  @IsString()
  @IsNotEmpty()
  hostawayReservationId: string;

  @IsString()
  @IsNotEmpty()
  listingName: string;

  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsDateString()
  checkoutDate: string;

  @IsString()
  @IsNotEmpty()
  checkoutTime: string;

  @IsString()
  @IsOptional()
  guestName?: string;

  @IsString()
  @IsOptional()
  plannedStartTime?: string;

  @IsString()
  @IsOptional()
  plannedEndTime?: string;
}
