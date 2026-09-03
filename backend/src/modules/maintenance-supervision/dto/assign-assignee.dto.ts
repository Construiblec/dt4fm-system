import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

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
    description: 'Nota que se anexa a la bitácora del proceso',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
