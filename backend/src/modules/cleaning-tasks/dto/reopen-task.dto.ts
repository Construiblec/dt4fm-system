import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReopenTaskDto {
  @ApiPropertyOptional({ description: 'Observaciones para la reapertura de la tarea', example: 'Faltó limpiar la nevera por dentro', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;
}
