import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/** YYYY-MM-DD */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'debe tener formato YYYY-MM-DD';

export class GetCheckoutsQueryDto {
  /**
   * Fecha única. Se mantiene por compatibilidad con los clientes que ya
   * consultan un solo día; si se envía junto a dateFrom/dateTo, estos ganan.
   */
  @ApiPropertyOptional({
    description: 'Consultar un único día (YYYY-MM-DD). Por defecto, hoy.',
    example: '2026-08-07',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: `date ${DATE_MESSAGE}` })
  date?: string;

  @ApiPropertyOptional({
    description: 'Inicio del rango de checkouts (YYYY-MM-DD)',
    example: '2026-08-07',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: `dateFrom ${DATE_MESSAGE}` })
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Fin del rango de checkouts, inclusive (YYYY-MM-DD)',
    example: '2026-08-14',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_PATTERN, { message: `dateTo ${DATE_MESSAGE}` })
  dateTo?: string;
}
