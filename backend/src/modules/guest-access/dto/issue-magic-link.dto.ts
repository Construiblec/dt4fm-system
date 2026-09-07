import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class IssueMagicLinkDto {
  @ApiProperty({
    description:
      'ID interno de la reserva en Hostaway (el campo `id`, no ' +
      '`hostawayReservationId`, que es el del canal de venta).',
    example: 46157859,
  })
  @Type(() => Number)
  @IsInt({ message: 'reservationId debe ser un número entero.' })
  @IsPositive({ message: 'reservationId debe ser mayor que cero.' })
  reservationId: number;
}
