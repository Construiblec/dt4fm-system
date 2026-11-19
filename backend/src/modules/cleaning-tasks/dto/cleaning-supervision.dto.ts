import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_FINDING_OBSERVATION } from '../constants/supervision.constants';

export class OpenSupervisionDto {
  @ApiProperty({
    description: 'Limpieza (CleaningTask) que se va a supervisar',
    example: 11800001,
  })
  @IsInt()
  @IsPositive()
  taskId: number;
}

export class CreateFindingDto {
  @ApiProperty({
    description:
      'Número del punto del checklist de supervisión (1 = primera fila del CSV)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  index: number;

  @ApiProperty({
    description: 'Subcategoría de Limpieza (LIM) que describe la novedad',
    example: 10734703,
  })
  @IsInt()
  @IsPositive()
  subcategoryId: number;

  @ApiPropertyOptional({
    description: 'Observación. Obligatoria cuando la subcategoría es «Otro».',
    example: 'Mancha en la sábana de la cama principal',
    maxLength: MAX_FINDING_OBSERVATION,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FINDING_OBSERVATION)
  observation?: string;
  @ApiPropertyOptional({
    description:
      'El supervisor la resolvió al momento: no se envía a corrección',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  resolvedBySupervisor?: boolean;
}

export class UpdateFindingDto {
  @ApiPropertyOptional({ description: 'Número del punto', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  index?: number;

  @ApiPropertyOptional({ description: 'Subcategoría LIM', example: 10734714 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  subcategoryId?: number;

  @ApiPropertyOptional({
    description: 'Observación; cadena vacía la borra (salvo con «Otro»)',
    maxLength: MAX_FINDING_OBSERVATION,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_FINDING_OBSERVATION)
  observation?: string;
  @ApiPropertyOptional({
    description:
      'El supervisor la resolvió al momento: no se envía a corrección',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  resolvedBySupervisor?: boolean;
}

export class AssignCorrectorDto {
  @ApiProperty({
    description: 'Operario del equipo de limpieza que corrige las novedades',
    example: 2397001,
  })
  @IsInt()
  @IsPositive()
  employeeId: number;
}
