import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({
    description: 'ID de la área común (CommonArea)',
    example: '12',
  })
  @IsString()
  @IsNotEmpty()
  commonAreaId: string;

  @ApiProperty({
    description: 'Fecha y hora de inicio (yyyy-MM-ddTHH:mm:ss)',
    example: '2026-06-03T18:00:00',
  })
  @IsString()
  @IsNotEmpty()
  // Formato: yyyy-MM-ddTHH:mm:ss
  fechaInicio: string;

  @ApiProperty({
    description: 'Fecha y hora de fin (yyyy-MM-ddTHH:mm:ss)',
    example: '2026-06-03T20:00:00',
  })
  @IsString()
  @IsNotEmpty()
  // Formato: yyyy-MM-ddTHH:mm:ss
  fechaFin: string;

  @ApiPropertyOptional({
    description: 'Observaciones para la reservación',
    example: 'Reunión de cumpleaños familiar',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
