import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CompleteIncidentDto {
  @ApiPropertyOptional({
    description: 'Notas u observaciones del cierre del incidente',
    example: 'Trabajo finalizado, fuga sellada y área limpia.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
