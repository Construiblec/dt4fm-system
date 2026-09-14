import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const HOSTAWAY_RESERVATION_OBJECT = 'reservation';

export const HOSTAWAY_RESERVATION_EVENTS = [
  'reservation.created',
  'reservation.updated',
];

/**
 * Solo los campos que el control de accesos necesita; el resto se descarta. Se
 * valida en el controller, una vez confirmado que el objeto es una reserva.
 */
export class HostawayWebhookDataDto {
  @ApiPropertyOptional({
    description: 'Id interno de la reserva en Hostaway',
    example: '65895170',
  })
  @IsOptional()
  hostawayReservationId?: string | number;

  @ApiPropertyOptional({
    description: 'Id interno de la reserva (nombre alterno)',
    example: 65895170,
  })
  @IsOptional()
  id?: string | number;

  @ApiPropertyOptional({ description: 'Listing de Hostaway', example: 288172 })
  @IsOptional()
  listingMapId?: string | number;

  @ApiPropertyOptional({
    description: 'Nombre del huésped',
    example: 'Ana Pérez',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestName?: string;

  @ApiPropertyOptional({ description: 'Correo del huésped' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestEmail?: string;

  @ApiPropertyOptional({
    description: 'Llegada, YYYY-MM-DD',
    example: '2026-09-14',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  arrivalDate?: string;

  @ApiPropertyOptional({
    description: 'Salida, YYYY-MM-DD',
    example: '2026-09-18',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  departureDate?: string;

  @ApiPropertyOptional({
    description: 'Estado de la reserva en Hostaway',
    example: 'new',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @ApiPropertyOptional({ description: 'Hora local de check-in', example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  checkInTime?: number;

  @ApiPropertyOptional({ description: 'Hora local de check-out', example: 11 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  checkOutTime?: number;
}

/** Sobre del unified webhook: Hostaway no filtra, así que llegan todos los objetos. */
export class HostawayWebhookDto {
  @ApiProperty({ description: 'Tipo de objeto', example: 'reservation' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  object: string;

  @ApiProperty({
    description: 'Evento de Hostaway',
    example: 'reservation.created',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  event: string;

  @ApiPropertyOptional({ description: 'Cuenta de Hostaway', example: 149703 })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @ApiProperty({
    description: 'Objeto del evento; para reservas, HostawayWebhookDataDto',
    type: HostawayWebhookDataDto,
  })
  @IsObject()
  data: Record<string, unknown>;
}
