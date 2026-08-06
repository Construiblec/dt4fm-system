import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
    description:
      'Tiempo trabajado en esta ejecución, en horas decimales. Lo mide el front ' +
      'desde que el empleado toca "Iniciar" en la tarjeta (el cronómetro que ' +
      'arranca en cero). Se suma al ExecutionTime ya acumulado en OpenMAINT.',
    example: 0.75,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  executionHours?: number;
}
