import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CompleteTaskDto {
  @ApiPropertyOptional({
    description: 'Observaciones al finalizar la tarea de limpieza',
    example: 'Todo listo, toallas y sábanas cambiadas.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observations?: string;

  @ApiPropertyOptional({
    description: 'Fecha en la que inició la sesión de trabajo actual (ISO).',
    example: '2023-10-01T12:00:00Z',
  })
  @IsOptional()
  @IsString()
  sessionStartTime?: string;
}
