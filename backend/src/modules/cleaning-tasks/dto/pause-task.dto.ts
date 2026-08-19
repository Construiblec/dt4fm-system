import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class PauseTaskDto {
  @ApiProperty({
    description:
      'Motivo de la pausa. Se guarda en TeamObservations precedido por la marca ' +
      'con fecha y hora: "[Pausado: 2026-08-19 | 10:20]: <motivo>".',
    example: 'Falta de insumos, esperando reposición',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Debes indicar el motivo de la pausa' })
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Tiempo total trabajado hasta la pausa, en minutos (double). Lo mide el ' +
      'front: el acumulado que traía la tarea más lo transcurrido en esta ' +
      'sesión. REEMPLAZA a ExecutionTime en OpenMAINT, no se suma.',
    example: 35,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  executionMinutes?: number;

  @ApiPropertyOptional({
    description:
      'Lo que el empleado llevaba escrito en el campo "Observaciones" al pausar. ' +
      'Se guarda entre llaves al final de TeamObservations y no se muestra en ' +
      'ninguna vista: es un borrador que se le devuelve al reanudar y que ' +
      'desaparece al completar la tarea.',
    example: 'Falta pasar la aspiradora en el cuarto principal',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  draftObservations?: string;
}
