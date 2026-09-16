import { HttpException, Injectable, Logger } from '@nestjs/common';
import { HostawayService } from '../../../integrations/hostaway/hostaway.service';
import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';

/** La reserva existe pero Hostaway aún no le abrió conversación. */
export const CONVERSATION_NOT_FOUND = 'conversation_not_found';

/**
 * Texto del mensaje. Bilingüe porque los huéspedes de Airbnb y Booking suelen
 * ser extranjeros. Solo lleva la URL: el PIN se ve dentro del portal (D-10).
 */
export function buildGuestLinkMessage(payload: GuestLinkPayload): string {
  const nombre = payload.stay.guestName.trim() || 'Huésped';

  return [
    `Hola ${nombre}: aquí tienes el enlace a tu portal de huésped. Ahí verás los datos de tu estancia y, el día de tu llegada, tu código de acceso al edificio.`,
    '',
    `Hi ${nombre}: here is the link to your guest portal. There you'll find your stay details and, on arrival day, your building access code.`,
    '',
    payload.link.url,
  ].join('\n');
}

/**
 * Entrega el enlace como mensaje en la conversación de Hostaway de la reserva.
 * Hostaway lo relaya al chat del canal (Airbnb, Booking, Vrbo…), que es donde
 * el huésped ya está mirando.
 */
@Injectable()
export class HostawayMessageLinkChannel implements GuestLinkChannel {
  readonly name = 'hostaway-message';

  private readonly logger = new Logger(HostawayMessageLinkChannel.name);

  constructor(private readonly hostaway: HostawayService) {}

  async send(payload: GuestLinkPayload): Promise<GuestLinkSendResult> {
    const reservationId = payload.stay.reservationId;

    try {
      const conversation =
        await this.hostaway.findConversationByReservation(reservationId);

      if (!conversation) {
        this.logger.warn(
          `Reserva ${reservationId}: sin conversación en Hostaway todavía`,
        );

        return {
          success: false,
          channel: this.name,
          target: '',
          error: CONVERSATION_NOT_FOUND,
        };
      }

      const target = `conversation:${conversation.id}`;

      await this.hostaway.sendConversationMessage(
        conversation.id,
        buildGuestLinkMessage(payload),
        'channel',
      );

      return { success: true, channel: this.name, target };
    } catch (error) {
      const httpStatus =
        error instanceof HttpException ? error.getStatus() : undefined;
      const detail = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Reserva ${reservationId}: mensaje de Hostaway fallido -> ${detail}`,
      );

      return {
        success: false,
        channel: this.name,
        target: '',
        httpStatus,
        error: detail,
      };
    }
  }
}
