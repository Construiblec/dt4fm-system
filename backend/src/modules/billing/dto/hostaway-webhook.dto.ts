import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Payload que envía Hostaway en el webhook de reservación creada/actualizada.
 * Solo mapeamos los campos que necesitamos para la facturación.
 */
export class HostawayWebhookDto {
  @IsString()
  @IsNotEmpty()
  action: string; // 'reservation_created' | 'reservation_updated'

  @IsNotEmpty()
  data: {
    id?: number;
    hostawayReservationId?: number;
    guestName?: string;
    guestFirstName?: string;
    guestLastName?: string;
    guestEmail?: string;
    guestPhone?: string;
    listingName?: string;
    listingMapId?: number;
    arrivalDate?: string;
    departureDate?: string;
    totalPrice?: number;
    cleaningFee?: number;
    channelCommissionAmount?: number;
    currency?: string;
    status?: string;
  };
}
