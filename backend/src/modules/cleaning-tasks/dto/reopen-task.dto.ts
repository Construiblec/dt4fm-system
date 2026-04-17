import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}
