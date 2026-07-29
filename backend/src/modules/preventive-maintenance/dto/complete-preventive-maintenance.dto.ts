import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CompletePreventiveMaintenanceDto {
  @ApiPropertyOptional({
    description: 'Notas u observaciones del cierre del mantenimiento',
    example: 'Checklist completado, sensor calibrado y sin novedades.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
