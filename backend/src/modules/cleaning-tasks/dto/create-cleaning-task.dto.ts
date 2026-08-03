import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateCleaningTaskDto {
  @ApiProperty({
    description: 'ID de reservación de Hostaway',
    example: '4857692',
  })
  @IsString()
  @IsNotEmpty()
  hostawayReservationId: string;

  @ApiProperty({
    description: 'Nombre de la propiedad / anuncio',
    example: 'Suite de Lujo frente al mar',
  })
  @IsString()
  @IsNotEmpty()
  listingName: string;

  @ApiProperty({
    description: 'ID de la propiedad en Hostaway',
    example: '293847',
  })
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @ApiProperty({
    description: 'Fecha de checkout (YYYY-MM-DD)',
    example: '2026-06-03',
  })
  @IsDateString()
  checkoutDate: string;

  @ApiProperty({ description: 'Hora de checkout', example: '11:00' })
  @IsString()
  @IsNotEmpty()
  checkoutTime: string;

  @ApiPropertyOptional({
    description: 'Nombre del huésped',
    example: 'Alice Smith',
  })
  @IsString()
  @IsOptional()
  guestName?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de inicio planificada (ISO 8601)',
    example: '2026-06-03T11:30:00Z',
  })
  @IsString()
  @IsOptional()
  plannedStartTime?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora de fin planificada (ISO 8601)',
    example: '2026-06-03T14:30:00Z',
  })
  @IsString()
  @IsOptional()
  plannedEndTime?: string;
}
