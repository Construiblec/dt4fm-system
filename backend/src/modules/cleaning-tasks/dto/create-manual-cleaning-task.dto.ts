import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Creación manual de una limpieza (Source: 'Manual'), a diferencia del flujo
 * de sincronización con Hostaway (`CreateCleaningTaskDto`), que exige
 * `hostawayReservationId` y no permite fijar Unit/Employee al crear.
 */
export class CreateManualCleaningTaskDto {
  @ApiProperty({
    description: 'ID de la Unit (unidad) a limpiar',
    example: 1187,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId: number;

  @ApiProperty({ description: 'ID del empleado asignado', example: 4567 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId: number;

  @ApiProperty({
    description: 'Fecha y hora de inicio planificada (ISO 8601)',
    example: '2026-06-03T09:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  plannedStartTime: string;

  @ApiProperty({
    description: 'Fecha y hora de fin planificada (ISO 8601)',
    example: '2026-06-03T12:00:00Z',
  })
  @IsString()
  @IsNotEmpty()
  plannedEndTime: string;

  @ApiProperty({
    description:
      'Descripción de la tarea. Obligatoria: a diferencia del flujo Hostaway no hay listingName del que derivarla.',
    example: 'Limpieza profunda - Torre A, Depto 302',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({
    description: 'ID de la plantilla de checklist (CleaningActivity)',
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cleaningChecklistId?: number;

  @ApiPropertyOptional({ description: 'Observaciones de la tarea' })
  @IsString()
  @IsOptional()
  observations?: string;
}
