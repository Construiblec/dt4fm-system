import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
      'Tiempo TOTAL trabajado en la tarea, en minutos (double). Lo mide el front: ' +
      'el acumulado que traía la tarea más lo transcurrido desde que el empleado ' +
      'tocó "Iniciar"/"Reanudar". REEMPLAZA a ExecutionTime en OpenMAINT, no se suma.',
    example: 90,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  executionMinutes?: number;
}
