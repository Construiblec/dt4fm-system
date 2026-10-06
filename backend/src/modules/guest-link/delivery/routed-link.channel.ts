import { Logger } from '@nestjs/common';
import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';

/** `channelName` de Hostaway para reservas que no vienen de una OTA. */
const DIRECT_CHANNEL_NAMES = ['direct'];

export function isDirectReservation(channelName: string | null): boolean {
  const normalized = channelName?.trim().toLowerCase() ?? '';

  return normalized === '' || DIRECT_CHANNEL_NAMES.includes(normalized);
}

/**
 * Elige el canal según de dónde viene la reserva.
 *
 * Reserva de canal (Airbnb, Booking, Vrbo…): mensaje en la conversación de
 * Hostaway, que es donde el huésped ya está mirando. Si falla y la reserva
 * trae correo, se intenta por correo. Reserva directa o sin canal conocido:
 * solo correo, porque no hay chat de canal al que llegar.
 *
 * El resultado lleva el `channel` del canal que realmente entregó, para que
 * `guest_link_delivery` diga por dónde salió y no solo que salió.
 */
export class RoutedLinkChannel implements GuestLinkChannel {
  readonly name = 'hostaway';

  private readonly logger = new Logger(RoutedLinkChannel.name);

  constructor(
    private readonly porMensaje: GuestLinkChannel,
    private readonly porCorreo: GuestLinkChannel,
  ) {}

  async send(payload: GuestLinkPayload): Promise<GuestLinkSendResult> {
    if (isDirectReservation(payload.stay.channelName)) {
      return this.porCorreo.send(payload);
    }

    const mensaje = await this.porMensaje.send(payload);

    if (mensaje.success || !payload.stay.guestEmail?.trim()) {
      return mensaje;
    }

    this.logger.warn(
      `Estancia ${payload.stay.id}: ${this.porMensaje.name} falló (${mensaje.error ?? 'sin motivo'}); se intenta por ${this.porCorreo.name}`,
    );

    const correo = await this.porCorreo.send(payload);

    if (correo.success) {
      return correo;
    }

    return {
      ...correo,
      error: `${this.porMensaje.name}: ${mensaje.error ?? 'sin motivo'} | ${this.porCorreo.name}: ${correo.error ?? 'sin motivo'}`,
    };
  }
}
