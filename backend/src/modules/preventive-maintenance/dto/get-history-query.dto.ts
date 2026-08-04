import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetHistoryQueryDto {
  /**
   * Acotado a 25 porque el conteo de informes hace una petición por fila.
   */
  @ApiPropertyOptional({
    description: 'Cantidad máxima de mantenimientos anteriores a devolver',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number = 10;
}
