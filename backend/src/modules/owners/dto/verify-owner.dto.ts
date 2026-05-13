import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyOwnerDto {
  @IsString()
  @IsNotEmpty()
  idNumber: string;

  @IsString()
  @IsNotEmpty()
  buildingId: string;
}
