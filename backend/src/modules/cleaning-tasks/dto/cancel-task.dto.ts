import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelTaskDto {
  @ApiProperty({
    description: 'Razón de la cancelación de la tarea',
    example: 'Cancelación de reserva por el huésped',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
