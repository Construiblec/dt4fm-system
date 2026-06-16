import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  MailMessage,
  MailProvider,
  MailSendResult,
} from './mail-provider.interface';

/**
 * Proveedor de correo basado en el SDK HTTP de Resend.
 * No usa SMTP — envía directamente via la API REST de Resend.
 * Necesario en entornos que bloquean conexiones SMTP salientes (ej. Render).
 *
 * Variables de entorno requeridas:
 *   RESEND_API_KEY      API key de Resend
 *   RESEND_FROM_EMAIL   Remitente por defecto (dominio verificado en Resend)
 */
@Injectable()
export class ResendMailProvider implements MailProvider {
  readonly name = 'resend';

  private readonly logger = new Logger(ResendMailProvider.name);
  private readonly resend: Resend;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    this.resend = new Resend(apiKey);
    this.defaultFrom =
      this.configService.get<string>('RESEND_FROM_EMAIL') ??
      this.configService.get<string>('RESEND_FROM') ??
      'noreply@construiblec.cloud';

    this.logger.log(
      `[Resend] Proveedor inicializado → from=${this.defaultFrom}`,
    );
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: message.from ?? this.defaultFrom,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, 'base64'),
        })),
      });

      if (error) {
        this.logger.error(
          `[Resend] Fallo al enviar a ${message.to}: ${error.message}`,
        );
        return { to: message.to, success: false, error: error.message };
      }

      this.logger.log(
        `[Resend] Correo enviado correctamente a ${message.to} (id=${data?.id})`,
      );
      return { to: message.to, success: true, messageId: data?.id };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'Error desconocido Resend';
      this.logger.error(
        `[Resend] Excepción al enviar a ${message.to}: ${reason}`,
      );
      return { to: message.to, success: false, error: reason };
    }
  }

  async verify(): Promise<boolean> {
    try {
      const { data, error } = await this.resend.domains.list();
      if (error) {
        this.logger.error(`[Resend] Verificación fallida: ${error.message}`);
        return false;
      }
      const count = (data as { data?: unknown[] } | null)?.data?.length ?? 0;
      this.logger.log(
        `[Resend] Verificación exitosa. Dominios configurados: ${count}`,
      );
      return true;
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`[Resend] Verificación fallida: ${reason}`);
      return false;
    }
  }
}
