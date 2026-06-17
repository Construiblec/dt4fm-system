import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../../integrations/openmaint/openmaint.client';
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
  private readonly historialEnabled: boolean;

  /**
   * Sesión de servicio con openMAINT cacheada para registrar en HistorialEmail.
   * Se invalida (=> null) ante cualquier fallo del POST para forzar un nuevo
   * login en el siguiente envío (cubre el caso de sesión vencida).
   */
  private cachedSessionId: string | null = null;

  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: MailProvider,
    private readonly configService: ConfigService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly openmaintAuthService: OpenmaintAuthService,
  ) {
    this.throttleMs = Number(
      this.configService.get<string>('MAIL_THROTTLE_MS') ?? 200,
    );
    // Activado por defecto: todo envío exitoso deja registro en openMAINT.
    // Desactivable con HISTORIAL_EMAIL_ENABLED=false (p.ej. entornos sin openMAINT).
    this.historialEnabled =
      (this.configService.get<string>('HISTORIAL_EMAIL_ENABLED') ?? 'true') !==
      'false';
  }

  /** Envía un único mensaje y registra el envío exitoso en HistorialEmail. */
  async sendOne(message: MailMessage): Promise<MailSendResult> {
    const result = await this.provider.send(message);

    if (result.success) {
      // Best-effort: el registro NO debe afectar el resultado del envío.
      await this.recordHistorialEmail(message);
    }

    return result;
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
      // 🔥 Normalizar attachments (evita errores del provider)
      const normalizedAttachments = (message.attachments || []).map((file) => ({
        filename: file.filename,
        content: file.content.replace(/^data:image\/\w+;base64,/, ''), // limpia prefix si existe
        contentType: file.contentType || 'application/octet-stream',
      }));

      const normalizedMessage: MailMessage = {
        ...message,
        attachments: normalizedAttachments.length
          ? normalizedAttachments
          : undefined,
      };

      const result = await this.sendOne(normalizedMessage);
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

  // ─── Registro en HistorialEmail (openMAINT) ──────────────────────────────────

  /**
   * Inserta una card en la clase `HistorialEmail` de openMAINT como bitácora
   * del envío. Best-effort: cualquier fallo se loguea como warning y NO
   * interrumpe el flujo de correo. openMAINT autocompleta `_id`, `_beginDate`
   * y `_user`; aquí solo enviamos Desde / Para / Asunto.
   */
  private async recordHistorialEmail(message: MailMessage): Promise<void> {
    if (!this.historialEnabled) {
      return;
    }

    const sessionId = await this.getOpenmaintSessionId();
    if (!sessionId) {
      return;
    }

    try {
      await this.openmaintClient.post(
        '/classes/HistorialEmail/cards',
        {
          Desde: this.resolveSender(message),
          Para: message.to,
          Asunto: message.subject,
        },
        sessionId,
      );
    } catch (error) {
      // Posible sesión vencida u otro fallo: invalida el cache para reintentar
      // el login en el próximo envío.
      this.cachedSessionId = null;
      this.logger.warn(
        `HistorialEmail: no se pudo registrar el envío a ${message.to}: ` +
          `${(error as Error).message}`,
      );
    }
  }

  /**
   * Devuelve (y cachea) un sessionId de servicio de openMAINT. Si faltan
   * credenciales o el login falla, devuelve null y el registro se omite
   * silenciosamente (warning), sin afectar el envío.
   */
  private async getOpenmaintSessionId(): Promise<string | null> {
    if (this.cachedSessionId) {
      return this.cachedSessionId;
    }

    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');
    if (!username || !password) {
      this.logger.warn(
        'HistorialEmail: faltan OPENMAINT_USERNAME/OPENMAINT_PASSWORD; ' +
          'se omite el registro.',
      );
      return null;
    }

    try {
      const response = await this.openmaintAuthService.login(
        username,
        password,
      );
      this.cachedSessionId = response?.data?._id ?? null;
      return this.cachedSessionId;
    } catch (error) {
      this.logger.warn(
        `HistorialEmail: no se pudo iniciar sesión en openMAINT: ` +
          `${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Resuelve el remitente a registrar: el del mensaje si viene explícito, o el
   * remitente por defecto del proveedor activo según su configuración.
   */
  private resolveSender(message: MailMessage): string {
    if (message.from) {
      return message.from;
    }

    if (this.provider.name === 'resend') {
      return (
        this.configService.get<string>('RESEND_FROM_EMAIL') ??
        this.configService.get<string>('RESEND_FROM') ??
        'noreply@construiblec.cloud'
      );
    }

    return (
      this.configService.get<string>('SMTP_FROM') ??
      'noreply@construiblec.cloud'
    );
  }
}
