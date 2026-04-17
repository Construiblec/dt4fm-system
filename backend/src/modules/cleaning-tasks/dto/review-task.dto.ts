import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewTaskDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewComments?: string;
}
