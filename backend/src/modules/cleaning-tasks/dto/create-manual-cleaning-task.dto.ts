import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Creación manual de una limpieza (`Source: Manual`), a diferencia del flujo
 * de sincronización con Hostaway (`CreateCleaningTaskDto`), que exige
 * `hostawayReservationId`.
 *
 * Obligatorios: descripción y horario. Unidad, empleado, checklist y
 * observaciones son opcionales; sin empleado la limpieza queda en Pendientes.
 */
export class CreateManualCleaningTaskDto {
  @ApiProperty({
    description:
      'Descripción de la limpieza. Obligatoria: a diferencia del flujo Hostaway no hay listingName del que derivarla.',
    example: 'Limpieza profunda - Pradera, Suite I41',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

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

  @ApiPropertyOptional({
    description: 'ID de la Unit (unidad) a limpiar',
    example: 1187,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId?: number;

  @ApiPropertyOptional({
    description: 'ID del empleado asignado',
    example: 4567,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;

  @ApiPropertyOptional({
    description: 'ID del checklist (CleaningActivity)',
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cleaningChecklistId?: number;

  @ApiPropertyOptional({ description: 'Observaciones para el equipo' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  observations?: string;
}
