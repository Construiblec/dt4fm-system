import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
