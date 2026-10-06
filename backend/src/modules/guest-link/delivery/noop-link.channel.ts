import { Injectable, Logger } from '@nestjs/common';
import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';

/** Motivo que queda en el registro cuando el canal está apagado. */
export const CHANNEL_DISABLED = 'channel_disabled';

/**
 * El canal por defecto: no entrega nada.
 *
 * Existe para que el envío automático quede **apagado hasta que alguien lo
 * configure a propósito** —un despliegue nuevo no debe empezar a mandar
 * enlaces a ninguna parte por accidente— y para que aun así quede constancia
 * en `guest_link_delivery` de que hubo una estancia que debió recibir su
 * enlace y no lo recibió.
 */
@Injectable()
export class NoopLinkChannel implements GuestLinkChannel {
  readonly name = 'none';

  private readonly logger = new Logger(NoopLinkChannel.name);

  send(payload: GuestLinkPayload): Promise<GuestLinkSendResult> {
    this.logger.warn(
      `Sin canal de entrega configurado (GUEST_LINK_CHANNEL): el enlace de la ` +
        `estancia ${payload.stay.id} no se envió a nadie`,
    );

    return Promise.resolve({
      success: false,
      target: '',
      error: CHANNEL_DISABLED,
    });
  }
}
