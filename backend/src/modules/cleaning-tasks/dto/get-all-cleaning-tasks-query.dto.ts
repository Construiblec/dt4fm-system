import { IsOptional, IsInt, Min, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { PHASE_NAMES, PHASE_IDS } from '../constants/phase.constants';

const VALID_PHASES = Object.values(PHASE_NAMES);

export class GetAllCleaningTasksQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /** Filtrar por fase: Assigned | InExecution | Completed | Reviewed | Cancelled */
  @IsOptional()
  @IsString()
  @IsIn(VALID_PHASES)
  phase?: string;

  /** Filtrar por fecha de generación (YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  date?: string;

  /** Filtrar por ID de empleado */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}
