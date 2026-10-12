import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateCleaningTaskDto {
  @ApiPropertyOptional({
    description: 'Fase de la tarea de limpieza (solo supervisión)',
    example: 'InExecution',
  })
  @IsString()
  @IsOptional()
  phase?: string;

  @ApiPropertyOptional({
    description: 'ID de empleado asignado',
    example: 4567,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

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
    description: 'Fecha y hora de inicio real (ISO 8601). Solo supervisión.',
    example: '2026-06-03T09:05:00Z',
  })
  @IsString()
  @IsOptional()
  actualStartTime?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de fin real (ISO 8601). Solo supervisión.',
    example: '2026-06-03T11:45:00Z',
  })
  @IsString()
  @IsOptional()
  actualEndTime?: string;

  @ApiPropertyOptional({
    description:
      'Observaciones generales de la tarea. Con `null` o texto vacío se borran.',
    example: 'Limpieza profunda de baños finalizada',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  observations?: string | null;

  @ApiPropertyOptional({
    description:
      'Tiempo de ejecución acumulado, en minutos (double). Solo supervisión.',
    example: 90,
  })
  @IsNumber()
  @IsOptional()
  executionTime?: number;

  @ApiPropertyOptional({
    description: 'Descripción de la limpieza (título que ve el equipo)',
    example: 'Limpieza profunda - Pradera, Suite I41',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Fecha de checkout (YYYY-MM-DD). Para corregir una reserva que cambió en Hostaway. Solo la fecha, nunca la hora.',
    example: '2026-06-03',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'checkoutDate debe tener formato YYYY-MM-DD',
  })
  @IsDateString({ strict: true })
  checkoutDate?: string;

  @ApiPropertyOptional({
    description: 'ID de la Unit. Con `null` se quita la unidad.',
    example: 1187,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId?: number | null;

  @ApiPropertyOptional({
    description:
      'ID del checklist (CleaningActivity). Con `null` se quita el checklist.',
    example: 42,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cleaningChecklistId?: number | null;
}
