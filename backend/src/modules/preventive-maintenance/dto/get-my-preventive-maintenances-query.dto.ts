import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VALID_PM_STATUSES } from '../constants/preventive-maint.constants';

export class GetMyPreventiveMaintenancesQueryDto {
  @ApiPropertyOptional({
    description: 'Cantidad máxima de mantenimientos a devolver',
    default: 50,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Cantidad de registros a omitir para paginación',
    default: 0,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /** Filtrar por estado: Planning | Acceptance | Execution | Suspension | Completed | Canceled */
  @ApiPropertyOptional({
    description: 'Filtrar por estado del mantenimiento preventivo',
    enum: VALID_PM_STATUSES,
    example: 'Execution',
  })
  @IsOptional()
  @IsString()
  @IsIn(VALID_PM_STATUSES)
  status?: string;
}
