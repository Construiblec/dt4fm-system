import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Crea o edita un checklist (clase openMAINT `CleaningActivity`).
 *
 * Llega como `multipart/form-data` porque el archivo CSV de la plantilla es un
 * campo más de la ficha: todos los campos de texto viajan como texto.
 *
 * `Description` es obligatoria en CMDBuild (verificado en la instancia), por
 * eso aquí también lo es.
 */
export class SaveCleaningActivityDto {
  @ApiProperty({
    description: 'Nombre del checklist',
    example: 'Limpieza profunda',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  templateName: string;

  @ApiProperty({
    description: 'Descripción del checklist (obligatoria en openMAINT)',
    example: 'Limpieza a fondo: cortinas, colchón, horno y refrigerador.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @ApiPropertyOptional({ description: 'Código', example: 'CHK-PROF' })
  @IsString()
  @IsOptional()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional({
    description:
      'Detalle: una actividad por línea (Titulo,Actividad,Minutos). Solo cuenta si no hay archivo de plantilla legible.',
  })
  @IsString()
  @IsOptional()
  detalle?: string;

  @ApiPropertyOptional({
    description: 'Con true se quita el archivo de plantilla que tuviera',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  removeTemplate?: boolean;
}
