import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { CM_PRIORITY_CODES } from '../constants/corrective-maint.constants';
import { SHORT_DESCRIPTION_MAX } from '../../incidents/dto/create-incident.dto';

export class AssignAssigneeDto {
  @ApiProperty({
    description: 'ID de la ficha `Employee` que queda como cesionario',
    example: 1456396,
  })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assigneeId: number;

  @ApiPropertyOptional({
    description:
      'ID del equipo de trabajo. **Solo aplica a correctivos**: en ' +
      '`PreventiveMaint` el atributo `Team` no es escribible en ningún paso ' +
      'del flujo, así que se ignora.',
    example: 1456427,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  teamId?: number;

  @ApiPropertyOptional({
    description:
      'Fecha prevista de inicio de ejecución (ISO 8601). Se escribe en ' +
      '`ExpExecStartDate` durante el mismo avance.',
    example: '2026-08-25T09:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  plannedStart?: string;

  @ApiPropertyOptional({
    description:
      'Código de prioridad. **Solo correctivos**: obligatorio si el correctivo ' +
      'aún no tiene una, porque al crearlo ya no se pide.',
    enum: Object.values(CM_PRIORITY_CODES),
    example: 'Medium',
  })
  @IsOptional()
  @IsIn(Object.values(CM_PRIORITY_CODES))
  priority?: string;

  @ApiPropertyOptional({
    description:
      'ID del equipo intervenido (superclase `Asset`). Opcional; solo correctivos.',
    example: 3209930,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assetId?: number;

  @ApiPropertyOptional({
    description:
      'ID de la categoría (`MaintCategory`). Solo correctivos; si no llega se usa la que ya tiene.',
    example: 1460015,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @ApiPropertyOptional({
    description:
      'ID de la subcategoría (`MaintSubcategory`) de esa categoría. Su nombre pasa a ser el título.',
    example: 1460074,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  subcategoryId?: number;

  @ApiPropertyOptional({
    description:
      'Solo con la subcategoría «Otro»: qué tipo de novedad es (nuevo título).',
    example: 'Puerta del clóset descuadrada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_DESCRIPTION_MAX)
  shortDescription?: string;

  @ApiPropertyOptional({
    description: 'Nota que se anexa a la bitácora del proceso',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
