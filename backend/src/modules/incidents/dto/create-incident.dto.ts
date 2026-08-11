import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateIncidentDto {
  @ApiProperty({ description: 'ID del edificio', example: 3456 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId: number;

  @ApiProperty({
    description: 'Área o piso de la incidencia',
    example: 'Piso 2 - Hall de entrada',
  })
  @IsString()
  // ShortDescr es una columna de 255 en CMDBuild
  @MaxLength(255)
  floorArea: string;

  @ApiProperty({
    description:
      'Prioridad de la incidencia (ej. 1 = Alta, 2 = Media, 3 = Baja)',
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority: number;

  @ApiProperty({
    description: 'Descripción o notas adicionales del incidente',
    example: 'Fuga de agua detectada en la junta de tubería',
  })
  @IsString()
  notes: string;
}
