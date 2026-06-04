import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  MailMessage,
  MailProvider,
  MailSendResult,
} from './mail-provider.interface';

/**
 * Proveedor SMTP genérico basado en nodemailer.
 *
 * Funciona con CUALQUIER servidor SMTP (Brevo, Mailtrap, Amazon SES,
 * Gmail, un Postfix propio, etc.). Para cambiar de proveedor solo se
 * ajustan las variables de entorno: ni esta clase ni el resto del
 * módulo necesitan modificarse.
 *
 * Variables de entorno:
 *   SMTP_HOST       host del servidor SMTP
 *   SMTP_PORT       puerto (587 STARTTLS, 465 SSL, 2525 Mailtrap...)
 *   SMTP_SECURE     "true" para conexión TLS directa (puerto 465)
 *   SMTP_USER       usuario / API key
 *   SMTP_PASSWORD   contraseña / secret
 *   SMTP_FROM       remitente por defecto, ej. "DT4FM <no-reply@dominio.com>"
 *   SMTP_FROM_NAME  (opcional) nombre visible si SMTP_FROM no trae uno
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';

  private readonly logger = new Logger(SmtpMailProvider.name);
  private transporter: Transporter | null = null;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultFrom =
      this.configService.get<string>('SMTP_FROM') ||
      'DT4FM <no-reply@example.com>';
  }

  /**
   * Crea el transporter una sola vez (lazy) y lo reutiliza.
   * nodemailer mantiene un pool de conexiones internamente.
   */
  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const secure =
      (this.configService.get<string>('SMTP_SECURE') ?? 'false') === 'true';
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    try {
      const info = await this.getTransporter().sendMail({
        from: message.from ?? this.defaultFrom,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
      });

      return {
        to: message.to,
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido SMTP';
      this.logger.error(`Fallo al enviar a ${message.to}: ${reason}`);
      return {
        to: message.to,
        success: false,
        error: reason,
      };
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.getTransporter().verify();
      return true;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido SMTP';
      this.logger.error(`Verificación SMTP fallida: ${reason}`);
      return false;
    }
  }
}
