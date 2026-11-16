import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  IsString,
  IsIn,
  IsISO8601,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PHASE_NAMES } from '../constants/phase.constants';

const VALID_PHASES = Object.values(PHASE_NAMES);

export class GetAllCleaningTasksQueryDto {
  @ApiPropertyOptional({
    description: 'Cantidad máxima de tareas a devolver',
    default: 50,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Cantidad de registros a omitir para paginación',
    default: 0,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /** Filtrar por fase: Assigned | InExecution | Completed | Reviewed | Cancelled */
  @ApiPropertyOptional({
    description: 'Filtrar por fase de la tarea',
    enum: VALID_PHASES,
    example: 'Assigned',
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_PHASES)
  phase?: string;

  /** Filtrar por fecha de generación (YYYY-MM-DD) */
  @ApiPropertyOptional({
    description: 'Filtrar por fecha de generación (YYYY-MM-DD)',
    example: '2026-04-16',
  })
  @IsOptional()
  @IsString()
  date?: string;

  /** Solo las que terminaron desde este instante, incluido (ActualEndTime). */
  @ApiPropertyOptional({
    description:
      'Solo limpiezas con fecha de fin desde este instante, incluido (ISO 8601)',
    example: '2026-11-16T05:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  endedFrom?: string;

  /**
   * Solo las que terminaron antes de este instante, excluido. Con `endedFrom`
   * forma el rango [desde, hasta): el día completo es de medianoche a medianoche.
   */
  @ApiPropertyOptional({
    description:
      'Solo limpiezas con fecha de fin antes de este instante, excluido (ISO 8601)',
    example: '2026-11-17T05:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  endedTo?: string;

  /** Filtrar por ID de empleado */
  @ApiPropertyOptional({
    description: 'Filtrar por ID de empleado de limpieza',
    example: 4567,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  /** Orden del listado: 'newest' pone primero las recién creadas. */
  @ApiPropertyOptional({
    description: "Orden: 'newest' = recién creadas primero",
    enum: ['newest'],
  })
  @IsOptional()
  @IsIn(['newest'])
  sort?: 'newest';
}
