import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { MailerService, type BulkSendSummary } from './mail/mailer.service';
import { type MailMessage } from './mail/mail-provider.interface';
import { TemplateRenderer } from './template-renderer.service';
import { RecipientScope } from './recipient-scope.enum';
import { SendBulkDto } from './dto/send-bulk.dto';

// ─── Nombre de la clase de plantillas en openMAINT ───────────────────────────
// Se sobreescribe con la variable de entorno OPENMAINT_TEMPLATE_CLASS.
const DEFAULT_TEMPLATE_CLASS = 'EmailTemplate';

// ─── Tipos de openMAINT ──────────────────────────────────────────────────────

type TenantCard = {
  _id: number;
  Description: string;
  Email: string | null;
  _OccupancyType_code?: string | null;
};

type TenantCardsResponse = {
  data?: TenantCard[];
  meta?: { total: number };
};

/**
 * Estructura esperada de una plantilla guardada en openMAINT.
 * Los nombres de atributo (Subject, Body...) deben coincidir con los
 * de la clase EmailTemplate que se defina en openMAINT.
 */
type TemplateCard = {
  _id: number;
  Code?: string;
  Subject?: string;
  Body?: string;
};

type TemplateCardResponse = {
  data?: TemplateCard;
};

/**
 * Destinatario ya normalizado y listo para render/envío.
 */
interface ResolvedRecipient {
  email: string;
  name: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly templateClass: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly mailerService: MailerService,
    private readonly templateRenderer: TemplateRenderer,
  ) {
    this.templateClass =
      this.configService.get<string>('OPENMAINT_TEMPLATE_CLASS') ??
      DEFAULT_TEMPLATE_CLASS;
  }

  // ─── Caso de uso principal: envío masivo ahora ────────────────────────────

  /**
   * Envía un comunicado masivo:
   *   1. Trae la plantilla desde openMAINT.
   *   2. Resuelve los destinatarios (Tenant) según el alcance.
   *   3. Renderiza asunto y cuerpo por destinatario (variables {{...}}).
   *   4. Delega el envío al MailerService.
   *
   * Devuelve un resumen con enviados / fallidos.
   */
  async sendBulk(
    dto: SendBulkDto,
  ): Promise<BulkSendSummary & { template: string }> {
    const sessionId = await this.getAdminSessionId();

    const template = await this.getTemplate(dto.templateId, sessionId);
    const recipients = await this.resolveRecipients(dto.scope, sessionId);

    if (recipients.length === 0) {
      this.logger.warn(
        `Envío masivo sin destinatarios válidos (scope=${dto.scope})`,
      );
      return {
        total: 0,
        sent: 0,
        failed: 0,
        results: [],
        template: template.Code ?? String(template._id),
      };
    }

    const messages: MailMessage[] = recipients.map((recipient) => {
      const variables: Record<string, string> = {
        nombre: recipient.name,
        email: recipient.email,
        ...(dto.extraVars ?? {}),
      };

      const subject = this.templateRenderer.render(
        template.Subject ?? '',
        variables,
      );
      const html = this.templateRenderer.render(template.Body ?? '', variables);

      return {
        to: recipient.email,
        subject,
        html,
      };
    });

    const summary = await this.mailerService.sendBulk(messages);

    return {
      ...summary,
      template: template.Code ?? String(template._id),
    };
  }

  // ─── Caso de uso: Notificación de incidente creado ─────────────────────────

  /**
   * Envía un correo de notificación cuando se reporta un nuevo incidente.
   * Se envía al empleado solicitante (si tiene email válido) y al correo administrativo/soporte configurado.
   */
  async notifyIncidentCreated(
    incidentId: number,
    incidentNumber: string,
    incidentLocation: string,
    incidentBuilding: string,
    incidentStatus: string,
    incidentPriority: string,
    incidentCreatedAt: string,
    incidentNotes: string,
    incidentImages: string[],
  ): Promise<void> {
    const normalizePriority = (value: string) =>
      (value || '').trim().toLowerCase();

    const priorityMap: Record<string, { text: string; color: string }> = {
      high: { text: 'Alta', color: '#c62828' },
      medium: { text: 'Media', color: '#ef6c00' },
      low: { text: 'Baja', color: '#2e7d32' },
    };

    const priority =
      priorityMap[normalizePriority(incidentPriority)] ?? priorityMap['low'];

    // 🔥 Separar descripción y visitante de forma limpia
    const [rawDescription, visitorBlock] = incidentNotes.split(
      '--- Datos del visitante ---',
    );

    const description = (rawDescription || '').trim();

    const nameMatch = visitorBlock.match(/Nombre:\s*(.*?)\s*Tel[eé]fono:/i);
    const phoneMatch = visitorBlock.match(/Tel[eé]fono:\s*(.*)/i);

    const visitorHtml = `
    <div style="margin-top:12px;font-size:13px;">
      <strong>Reporta:</strong>
      <div>Nombre: ${nameMatch?.[1]?.trim() ?? 'No disponible'}</div>
      <div>Teléfono: ${phoneMatch?.[1]?.trim() ?? 'No disponible'}</div>
    </div>
  `;

    const subject = `[INCIDENTE NUEVO] #${incidentNumber} - ${incidentBuilding}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      
      <h3 style="margin:0 0 10px 0;">
        Incidente #${incidentNumber}
      </h3>

      <div style="font-size:13px;color:#555;">
        <div><strong>Edificio:</strong> ${incidentBuilding}</div>
        <div><strong>Ubicación:</strong> ${incidentLocation}</div>
        <div>
          <strong>Prioridad:</strong>
          <span style="color:${priority.color};font-weight:bold;">
            ${priority.text}
          </span>
        </div>
        <div>
          <strong>Fecha:</strong>
          ${new Date(incidentCreatedAt).toLocaleString('es-EC')}
        </div>
      </div>

      <hr style="margin:12px 0;" />

      <div style="font-size:13px;">
        <strong>Descripción</strong>
        <p style="margin:6px 0;white-space:pre-wrap;">
          ${description || 'Sin descripción'}
        </p>
      </div>

      ${visitorHtml}

      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>
  `;

    const attachments = (incidentImages || []).map((img, index) => ({
      filename: `imagen-${index + 1}.jpg`,
      content: img.replace(/^data:image\/\w+;base64,/, ''), // limpia prefijo si existe
      contentType: 'image/jpeg',
    }));

    const recipients =
      process.env.INCIDENT_NOTIFICATION_EMAIL?.split(',')
        .map((email) => email.trim())
        .filter(Boolean) || [];

    const messages = recipients.map((to) => ({
      to,
      subject,
      html,
      attachments,
    }));

    try {
      this.logger.log(
        `Enviando incidente #${incidentNumber} a: ${recipients.join(', ')}`,
      );

      await this.mailerService.sendBulk(messages);
    } catch (error) {
      this.logger.error(`Error enviando incidente #${incidentNumber}`, error);
    }
  }

  // ─── Diagnóstico ──────────────────────────────────────────────────────────

  /** Verifica que el proveedor de correo configurado responda. */
  async verifyMailProvider(): Promise<{ ok: boolean }> {
    const ok = await this.mailerService.verifyProvider();
    return { ok };
  }

  /**
   * Diagnóstico SMTP: muestra la config activa y hace una verificación de
   * conexión. Útil para depurar problemas de entrega sin tocar el código.
   * Nunca exponer en producción sin protección de auth.
   */
  async diagnoseSMTP(): Promise<Record<string, unknown>> {
    const host = this.configService.get<string>('SMTP_HOST') ?? '(no definido)';
    const port = this.configService.get<string>('SMTP_PORT') ?? '(no definido)';
    const secure =
      this.configService.get<string>('SMTP_SECURE') ?? '(no definido)';
    const user = this.configService.get<string>('SMTP_USER') ?? '(no definido)';
    const from = this.configService.get<string>('SMTP_FROM') ?? '(no definido)';

    const config = { host, port, secure, user, from };

    let connection: 'ok' | 'failed';
    let connectionError: string | null = null;

    try {
      const ok = await this.mailerService.verifyProvider();
      connection = ok ? 'ok' : 'failed';
    } catch (err) {
      connection = 'failed';
      connectionError = err instanceof Error ? err.message : String(err);
    }

    return {
      config,
      connection,
      ...(connectionError ? { connectionError } : {}),
      hint:
        connection === 'failed'
          ? [
              '1. Verifica que el puerto no esté bloqueado por el firewall o ISP.',
              '2. Puerto 465 requiere SMTP_SECURE=true. Puerto 587 requiere SMTP_SECURE=false.',
              '3. Asegúrate de que el dominio en SMTP_FROM esté verificado en Resend.',
              '4. Prueba con SMTP_PORT=587 y SMTP_SECURE=false si 465 falla.',
            ]
          : 'Conexión SMTP establecida correctamente.',
    };
  }

  // ─── Resolución de plantilla ──────────────────────────────────────────────

  private async getTemplate(
    templateId: string,
    sessionId: string,
  ): Promise<TemplateCard> {
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${this.templateClass}/cards/${templateId}`,
        sessionId,
      )) as TemplateCardResponse;

      if (!response.data) {
        throw new NotFoundException('La plantilla no existe');
      }

      return response.data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error al obtener la plantilla de openMAINT', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudo obtener la plantilla seleccionada',
      );
    }
  }

  // ─── Resolución de destinatarios ──────────────────────────────────────────

  /**
   * Trae los Tenant según el alcance, filtra correos inválidos y
   * deduplica por email para no enviar dos veces al mismo destinatario.
   *
   * NOTA: openMAINT no acepta el parámetro ?attrs con array JSON en esta
   * versión — rompe el SQL generado. Se traen todas las cards y se filtra
   * por OccupancyType en memoria usando el campo _OccupancyType_code que
   * openMAINT incluye automáticamente en la respuesta de cada card.
   */
  private async resolveRecipients(
    scope: RecipientScope,
    sessionId: string,
  ): Promise<ResolvedRecipient[]> {
    const path = this.buildTenantPath(scope);

    let response: TenantCardsResponse;
    try {
      response = (await this.openmaintClient.get(
        path,
        sessionId,
      )) as TenantCardsResponse;
    } catch (error) {
      this.logger.error('Error al consultar Tenant en openMAINT', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener los destinatarios',
      );
    }

    const cards = response.data ?? [];

    // Filtrar por tipo de ocupante en memoria cuando el scope no es ALL.
    // openMAINT devuelve _OccupancyType_code con el código del lookup.
    const occupancyCode = this.getOccupancyCode(scope);
    const filtered =
      scope === RecipientScope.ALL || !occupancyCode
        ? cards
        : cards.filter(
            (card) =>
              (card._OccupancyType_code ?? '').toLowerCase() ===
              occupancyCode.toLowerCase(),
          );

    if (scope !== RecipientScope.ALL && !occupancyCode) {
      this.logger.warn(
        `No hay código de OccupancyType configurado para scope=${scope}; ` +
          `se enviará a todos los Tenant.`,
      );
    }

    const seen = new Set<string>();
    const recipients: ResolvedRecipient[] = [];

    for (const card of filtered) {
      const email = (card.Email ?? '').trim().toLowerCase();
      if (!this.isValidEmail(email) || seen.has(email)) {
        continue;
      }
      seen.add(email);
      recipients.push({
        email,
        name: (card.Description ?? '').trim(),
      });
    }

    this.logger.log(
      `Destinatarios resueltos: ${recipients.length} (scope=${scope}, total cards=${cards.length})`,
    );

    return recipients;
  }

  /**
   * Construye el path REST para traer todos los Tenant sin el parámetro
   * ?attrs que rompe el SQL de openMAINT. El filtro por OccupancyType
   * se aplica en memoria después de recibir la respuesta.
   */
  private buildTenantPath(_scope: RecipientScope): string {
    return `/classes/Tenant/cards?limit=1000`;
  }

  /**
   * Devuelve el código de lookup según el scope.
   * Los códigos reales de la instancia openMAINT son:
   *   Propietario  → para owners
   *   Arrendatario → para tenants
   * Se pueden sobreescribir con variables de entorno.
   */
  private getOccupancyCode(scope: RecipientScope): string | null {
    if (scope === RecipientScope.OWNERS) {
      return (
        this.configService.get<string>('OPENMAINT_OCCUPANCY_OWNER_CODE') ??
        'Propietario'
      );
    }
    if (scope === RecipientScope.TENANTS) {
      return (
        this.configService.get<string>('OPENMAINT_OCCUPANCY_TENANT_CODE') ??
        'Arrendatario'
      );
    }
    return null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private isValidEmail(email: string): boolean {
    if (!email) {
      return false;
    }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Obtiene una sesión de servicio con openMAINT usando las credenciales
   * de administrador. Mismo patrón que OwnersService.
   */
  private async getAdminSessionId(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');
    const response = await this.openmaintAuthService.login(
      username!,
      password!,
    );
    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'No se pudo obtener sesión de servicio con openMAINT',
      );
    }
    return response.data._id;
  }
}
