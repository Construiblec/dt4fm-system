import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCredentialsQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por referencia del sujeto (reserva, tenant, empleado)',
    example: '4471',
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({
    description: 'Filtra por estado del ciclo de vida',
    enum: ['pending', 'active', 'revoked', 'expired'],
  })
  @IsOptional()
  @IsIn(['pending', 'active', 'revoked', 'expired'])
  status?: 'pending' | 'active' | 'revoked' | 'expired';

  @ApiPropertyOptional({
    description: 'Building._id de openMAINT',
    example: 3025058,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId?: number;

  @ApiPropertyOptional({ description: 'Máximo de resultados', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
