import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';

/**
 * Solo los campos que el control de accesos necesita. El `ValidationPipe`
 * global usa `whitelist`, así que el resto del cuerpo de Hostaway se descarta.
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
    example: 'confirmed',
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

export class HostawayWebhookDto {
  @ApiProperty({
    description: 'Evento de Hostaway',
    example: 'reservation_updated',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  action: string;

  @ApiProperty({
    description: 'Datos de la reserva',
    type: HostawayWebhookDataDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => HostawayWebhookDataDto)
  data: HostawayWebhookDataDto;
}
