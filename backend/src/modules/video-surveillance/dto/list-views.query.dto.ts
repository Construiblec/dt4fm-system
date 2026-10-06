import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListViewsQueryDto {
  @ApiPropertyOptional({ example: 'ING-CAM-01' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cameraId?: string;

  @ApiPropertyOptional({
    description: 'Usuario de openMAINT que pidió la sesión',
    example: 'cav.mock',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @ApiPropertyOptional({
    description: 'Building._id de openMAINT',
    example: 3025058,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId?: number;

  @ApiPropertyOptional({
    description: 'Desde (incluido), ISO 8601 con offset',
    example: '2026-10-01T00:00:00-05:00',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Hasta (excluido), ISO 8601 con offset',
    example: '2026-10-02T00:00:00-05:00',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Máximo de resultados', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
