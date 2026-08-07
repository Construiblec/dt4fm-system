import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateCleaningTaskDto {
  @ApiPropertyOptional({
    description: 'Fase de la tarea de limpieza',
    example: 'InExecution',
  })
  @IsString()
  @IsOptional()
  phase?: string;

  @ApiPropertyOptional({
    description: 'ID de empleado asignado',
    example: '4567',
  })
  @IsString()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de inicio planificada (ISO 8601)',
    example: '2026-06-03T09:00:00Z',
  })
  @IsString()
  @IsOptional()
  plannedStartTime?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de fin planificada (ISO 8601)',
    example: '2026-06-03T12:00:00Z',
  })
  @IsString()
  @IsOptional()
  plannedEndTime?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de inicio real (ISO 8601)',
    example: '2026-06-03T09:05:00Z',
  })
  @IsString()
  @IsOptional()
  actualStartTime?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de fin real (ISO 8601)',
    example: '2026-06-03T11:45:00Z',
  })
  @IsString()
  @IsOptional()
  actualEndTime?: string;

  @ApiPropertyOptional({
    description: 'Observaciones generales de la tarea',
    example: 'Limpieza profunda de baños finalizada',
  })
  @IsString()
  @IsOptional()
  observations?: string;

  @ApiPropertyOptional({
    description: 'Tiempo de ejecución acumulado, en minutos (double)',
    example: 90,
  })
  @IsNumber()
  @IsOptional()
  executionTime?: number;
}
