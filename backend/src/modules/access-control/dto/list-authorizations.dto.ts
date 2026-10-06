import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class ListAuthorizationsQueryDto {
  @ApiPropertyOptional({
    description: 'Llegadas desde esta fecha, inclusive. `YYYY-MM-DD`',
    example: '2026-09-11',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    description: 'Llegadas hasta esta fecha, inclusive. `YYYY-MM-DD`',
    example: '2026-09-18',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;
}
