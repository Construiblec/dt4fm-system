import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Límite del título que ve el supervisor en la tarjeta. */
export const SHORT_DESCRIPTION_MAX = 80;

export class CreateIncidentDto {
  @ApiProperty({ description: 'ID del edificio', example: 3456 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId: number;

  @ApiPropertyOptional({
    description:
      'Breve descripción de la incidencia; es el título de la tarjeta',
    example: 'Fuga de agua bajo el lavamanos',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_DESCRIPTION_MAX)
  shortDescription?: string;

  @ApiPropertyOptional({
    description:
      'Obsoleto: planta y área compuestas. Solo se usa como título si no llega `shortDescription`',
    example: 'Piso 2 - Hall de entrada',
  })
  @IsOptional()
  @IsString()
  // ShortDescr es una columna de 255 en CMDBuild
  @MaxLength(255)
  floorArea?: string;

  @ApiPropertyOptional({
    description: 'ID de la planta en OpenMAINT (clase Floor)',
    example: 3055144,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  floorId?: number;

  @ApiPropertyOptional({
    description: 'ID de la unidad inmobiliaria en OpenMAINT (clase Unit)',
    example: 3110665,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitId?: number;

  @ApiPropertyOptional({
    description: 'ID del área común en OpenMAINT (clase CommonAreas)',
    example: 3065444,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commonAreaId?: number;

  @ApiPropertyOptional({
    description:
      'ID del lookup de prioridad. Opcional: la fija el supervisor al asignar',
    example: 119,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiProperty({
    description: 'Descripción o notas adicionales del incidente',
    example: 'Fuga de agua detectada en la junta de tubería',
  })
  @IsString()
  notes: string;
}
