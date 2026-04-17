import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateCleaningTaskDto {
  @IsString()
  @IsOptional()
  phase?: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  plannedStartTime?: string;

  @IsString()
  @IsOptional()
  plannedEndTime?: string;

  @IsString()
  @IsOptional()
  actualStartTime?: string;

  @IsString()
  @IsOptional()
  actualEndTime?: string;

  @IsString()
  @IsOptional()
  observations?: string;
}
