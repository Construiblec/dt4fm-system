import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../../notifications/mail/mailer.service';
import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';

/** La reserva no trae correo; típico de Airbnb, que no lo comparte. */
export const NO_EMAIL = 'no_email';

/** Sin la URL a propósito: el asunto queda registrado en `HistorialEmail`. */
const SUBJECT = 'Tu portal de huésped · Your guest portal';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildGuestLinkEmailText(payload: GuestLinkPayload): string {
  const nombre = payload.stay.guestName.trim() || 'Huésped';

  return [
    `Hola ${nombre}: aquí tienes el enlace a tu portal de huésped. Ahí verás los datos de tu estancia y, el día de tu llegada, tu código de acceso al edificio.`,
    '',
    `Hi ${nombre}: here is the link to your guest portal. There you'll find your stay details and, on arrival day, your building access code.`,
    '',
    payload.link.url,
  ].join('\n');
}

export function buildGuestLinkEmailHtml(payload: GuestLinkPayload): string {
  const nombre = escapeHtml(payload.stay.guestName.trim() || 'Huésped');
  const url = escapeHtml(payload.link.url);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;line-height:1.6">
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Aquí tienes el enlace a tu portal de huésped. Ahí verás los datos de tu estancia y, el día de tu llegada, tu código de acceso al edificio.</p>
      <p style="color:#475569">Hi <strong>${nombre}</strong>, here is the link to your guest portal. There you'll find your stay details and, on arrival day, your building access code.</p>
      <p style="margin:28px 0">
        <a href="${url}"
           style="background:#0891b2;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:bold;display:inline-block">
          Abrir portal · Open portal
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:28px;word-break:break-all">
        Si el botón no funciona, copia esta dirección en tu navegador · If the button doesn't work, copy this address into your browser:<br />${url}
      </p>
    </div>
  `.trim();
}

/** Entrega el enlace por correo al `guestEmail` de la reserva. */
@Injectable()
export class EmailLinkChannel implements GuestLinkChannel {
  readonly name = 'email';

  private readonly logger = new Logger(EmailLinkChannel.name);

  constructor(private readonly mailer: MailerService) {}

  async send(payload: GuestLinkPayload): Promise<GuestLinkSendResult> {
    const to = payload.stay.guestEmail?.trim();

    if (!to) {
      return {
        success: false,
        channel: this.name,
        target: '',
        error: NO_EMAIL,
      };
    }

    try {
      const result = await this.mailer.sendOne({
        to,
        subject: SUBJECT,
        html: buildGuestLinkEmailHtml(payload),
        text: buildGuestLinkEmailText(payload),
      });

      if (!result.success) {
        this.logger.warn(
          `Estancia ${payload.stay.id}: correo fallido -> ${result.error ?? 'sin motivo'}`,
        );
      }

      return {
        success: result.success,
        channel: this.name,
        target: to,
        error: result.error,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Estancia ${payload.stay.id}: correo fallido -> ${detail}`,
      );

      return { success: false, channel: this.name, target: to, error: detail };
    }
  }
}
