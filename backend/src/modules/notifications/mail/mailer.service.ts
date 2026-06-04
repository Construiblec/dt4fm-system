import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAIL_PROVIDER,
  type MailMessage,
  type MailProvider,
  type MailSendResult,
} from './mail-provider.interface';

export interface BulkSendSummary {
  total: number;
  sent: number;
  failed: number;
  results: MailSendResult[];
}

/**
 * Motor de envío.
 *
 * Responsabilidad única: dado uno o varios mensajes YA renderizados,
 * los envía a través del MailProvider activo con control de ritmo.
 *
 * No conoce plantillas, ni openMAINT, ni la fuente de los destinatarios:
 * esa lógica vive en NotificationsService. Esta separación es la que
 * permite, cuando el volumen crezca, reemplazar `sendBulk` por una cola
 * (BullMQ/Redis) sin tocar la capa de negocio ni los proveedores.
 *
 * Variables de entorno:
 *   MAIL_THROTTLE_MS  pausa en milisegundos entre cada envío (defecto 200)
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly throttleMs: number;

  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly configService: ConfigService,
  ) {
    this.throttleMs = Number(
      this.configService.get<string>('MAIL_THROTTLE_MS') ?? 200,
    );
  }

  /** Envía un único mensaje. */
  async sendOne(message: MailMessage): Promise<MailSendResult> {
    return this.provider.send(message);
  }

  /**
   * Envía una lista de mensajes de forma secuencial y controlada.
   *
   * Para el volumen actual (decenas de destinatarios) esto es robusto y
   * suficiente. El pequeño delay entre envíos evita que el proveedor
   * gratuito aplique rate limiting o marque el tráfico como abuso.
   */
  async sendBulk(messages: MailMessage[]): Promise<BulkSendSummary> {
    const results: MailSendResult[] = [];

    for (const message of messages) {
      const result = await this.sendOne(message);
      results.push(result);

      if (this.throttleMs > 0) {
        await this.delay(this.throttleMs);
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.length - sent;

    this.logger.log(
      `Envío masivo completado vía ${this.provider.name}: ` +
        `${sent} enviados, ${failed} fallidos de ${results.length}`,
    );

    return {
      total: results.length,
      sent,
      failed,
      results,
    };
  }

  /** Comprueba la conexión del proveedor activo. */
  async verifyProvider(): Promise<boolean> {
    return this.provider.verify();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
