import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Query del listado del supervisor. `status` no se valida contra un `@IsIn`
 * porque el juego de estados depende del tipo (9 en correctivo, 6 en
 * preventivo); el servicio lo resuelve y devuelve 400 si no lo reconoce.
 */
export class ListMaintenancesQueryDto {
  @ApiPropertyOptional({
    description: 'Cantidad máxima de mantenimientos a devolver',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Cantidad de registros a omitir para paginación',
    default: 0,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description:
      'Nombre estable del estado. Correctivo: Opening, Assignment, ' +
      'Management, Estimate, Control, Execution, Accounting, Completed, ' +
      'Canceled. Preventivo: Planning, Acceptance, Execution, Suspension, ' +
      'Completed, Canceled.',
    example: 'Assignment',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'true → solo los que ya tienen cesionario; false → solo los que no lo ' +
      'tienen; omitido → todos.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  assigned?: boolean;

  @ApiPropertyOptional({
    description:
      'Filtra por `ExpExecStartDate` (inicio previsto) desde este instante, ' +
      '**incluido**. ISO-8601. Se espera el comienzo del día en la zona del ' +
      'usuario, porque es quien sabe en qué huso está.',
    example: '2026-06-18T05:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Filtra por `ExpExecStartDate` hasta este instante, **incluido**. ' +
      'ISO-8601, normalmente el final del día en la zona del usuario.',
    example: '2026-06-19T04:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
