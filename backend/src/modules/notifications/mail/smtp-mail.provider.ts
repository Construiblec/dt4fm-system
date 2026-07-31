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

    this.logger.log(
      `[SMTP] Configurando transporter → host=${host} port=${port} secure=${secure} user=${user}`,
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure, // STARTTLS obligatorio cuando no es SSL directo
      connectionTimeout: 10_000, // 10 segundos para abrir la conexión TCP
      greetingTimeout: 10_000, // 10 segundos para recibir el greeting SMTP
      socketTimeout: 15_000, // 15 segundos de inactividad máxima
      auth: user && pass ? { user, pass } : undefined,
      tls: {
        rejectUnauthorized: false, // tolera certificados auto-firmados en dev
      },
    });

    return this.transporter;
  }

  /** Invalida el transporter cacheado para forzar reconexión. */
  private resetTransporter(): void {
    this.transporter = null;
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

      this.logger.log(
        `[SMTP] Correo enviado correctamente a ${message.to} (messageId=${info.messageId})`,
      );

      return {
        to: message.to,
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido SMTP';

      // Si es error de conexión/greeting, invalidar el transporter para forzar
      // reconexión en el próximo intento con la config actualizada.
      const isConnectionError =
        reason.includes('Greeting never received') ||
        reason.includes('connect ECONNREFUSED') ||
        reason.includes('connect ETIMEDOUT') ||
        reason.includes('ENOTFOUND');

      if (isConnectionError) {
        this.logger.warn(
          `[SMTP] Error de conexión detectado ("${reason}"). ` +
            `Verificar host=${this.configService.get('SMTP_HOST')} ` +
            `port=${this.configService.get('SMTP_PORT')} ` +
            `secure=${this.configService.get('SMTP_SECURE')}. ` +
            `Reseteando transporter para próximo intento.`,
        );
        this.resetTransporter();
      } else {
        this.logger.error(`[SMTP] Fallo al enviar a ${message.to}: ${reason}`);
      }

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
      this.logger.log('[SMTP] Verificación de conexión exitosa.');
      return true;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Error desconocido SMTP';
      this.logger.error(
        `[SMTP] Verificación fallida: ${reason}. ` +
          `host=${this.configService.get('SMTP_HOST')} ` +
          `port=${this.configService.get('SMTP_PORT')} ` +
          `secure=${this.configService.get('SMTP_SECURE')}`,
      );
      this.resetTransporter();
      return false;
    }
  }
}
