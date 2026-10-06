import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/** Crea una plantilla de checklist (clase openMAINT `CleaningActivity`). */
export class CreateCleaningActivityDto {
  @ApiProperty({
    description: 'Nombre de la plantilla',
    example: 'Limpieza estándar',
  })
  @IsString()
  @IsNotEmpty()
  templateName: string;

  @ApiProperty({
    description:
      'Pasos del checklist, uno por línea (mismo formato que ya parsea el detalle de checklist de una tarea)',
    example: 'Tender camas\nLimpiar baños\nAspirar\nSacar basura',
  })
  @IsString()
  @IsNotEmpty()
  detail: string;

  @ApiPropertyOptional({
    description: 'Código de la plantilla',
    example: 'STD-01',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ description: 'Descripción de la plantilla' })
  @IsString()
  @IsOptional()
  description?: string;
}
