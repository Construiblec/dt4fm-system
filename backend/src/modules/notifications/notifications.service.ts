import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { MailerService, type BulkSendSummary } from './mail/mailer.service';
import { type MailMessage } from './mail/mail-provider.interface';
import { TemplateRenderer } from './template-renderer.service';
import { SendBulkDto } from './dto/send-bulk.dto';
import { MassSendDto } from './dto/mass-send.dto';
import { getTemplateCompleteIncident } from './html-templates';

const DEFAULT_TEMPLATE_CLASS = 'EmailTemplate';

// ─── Tipos internos ───────────────────────────────────────────────────────────

type TemplateCard = {
  _id: number;
  Code?: string;
  Subject?: string;
  Body?: string;
};

type TemplateCardResponse = {
  data?: TemplateCard;
};

// ─── Tipo de respuesta mass-send ─────────────────────────────────────────────

export type MassSendSummary = BulkSendSummary & {
  recipientsRequested: number;
  recipientsDeduplicated: number;
};

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

  // ─── Envío masivo (legacy) ────────────────────────────────────────────────

  async sendBulk(
    dto: SendBulkDto,
  ): Promise<BulkSendSummary & { template: string }> {
    const sessionId = await this.getAdminSessionId();
    const template = await this.getTemplate(dto.templateId, sessionId);
    const seen = new Set<string>();
    const uniqueRecipients = dto.recipients.filter((email) => {
      const normalized = email.trim().toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    if (uniqueRecipients.length === 0) {
      this.logger.warn(
        'Envio masivo sin destinatarios validos',
      );
      throw new NotFoundException('No hay destinatarios validos para enviar');
    }

    const messages: MailMessage[] = uniqueRecipients.map((email) => {
      const variables: Record<string, string> = {
        email: email.trim().toLowerCase(),
        ...(dto.extraVars ?? {}),
      };
      return {
        to: email.trim(),
        subject: this.templateRenderer.render(
          template.Subject ?? '',
          variables,
        ),
        html: this.templateRenderer.render(template.Body ?? '', variables),
      };
    });

    const summary = await this.mailerService.sendBulk(messages);
    const templateCode = template.Code ?? String(template._id);

    if (summary.failed > 0 || summary.sent !== summary.total) {
      throw new ServiceUnavailableException({
        message: 'No se pudieron enviar todos los correos',
        ...summary,
        template: templateCode,
      });
    }

    this.logger.log(
      `Envío masivo: ${summary.sent}/${summary.total} — plantilla=${template.Code}`,
    );

    return {
      ...summary,
      template: templateCode,
    };
  }

  // ─── Envío masivo openMAINT (mass-send) ───────────────────────────────────

  /**
   * La plantilla (Subject + Body) llega directamente en el body del request,
   * tomada tal cual de la card EmailTemplate de openMAINT.
   * La página personalizada construye el JSON y lo envía al backend.
   */
  async massSend(dto: MassSendDto): Promise<MassSendSummary> {
    const recipientsRequested = dto.recipients.length;

    // Deduplicar emails (case-insensitive)
    const seen = new Set<string>();
    const uniqueRecipients = dto.recipients.filter((email) => {
      const normalized = email.trim().toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });

    const recipientsDeduplicated =
      recipientsRequested - uniqueRecipients.length;

    if (uniqueRecipients.length === 0) {
      this.logger.warn('[mass-send] Sin destinatarios válidos tras deduplicar');
      return {
        total: 0,
        sent: 0,
        failed: 0,
        results: [],
        recipientsRequested,
        recipientsDeduplicated,
      };
    }

    // Construir un mensaje renderizado por destinatario
    const messages: MailMessage[] = uniqueRecipients.map((email) => {
      const variables: Record<string, string> = {
        email: email.trim().toLowerCase(),
        ...(dto.extraVars ?? {}),
      };
      return {
        to: email.trim(),
        subject: this.templateRenderer.render(dto.template.Subject, variables),
        html: this.templateRenderer.render(dto.template.Body, variables),
      };
    });

    const summary = await this.mailerService.sendBulk(messages);

    if (summary.failed > 0 || summary.sent !== summary.total) {
      throw new ServiceUnavailableException({
        message: 'No se pudieron enviar todos los correos',
        ...summary,
        recipientsRequested,
        recipientsDeduplicated,
      });
    }

    this.logger.log(
      `[mass-send] ${summary.sent}/${summary.total} enviados — ` +
        `duplicados=${recipientsDeduplicated}`,
    );

    return {
      ...summary,
      recipientsRequested,
      recipientsDeduplicated,
    };
  }

  // ─── Notificación de incidente creado ─────────────────────────────────────

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

    const [rawDescription, visitorBlock] = incidentNotes.split(
      '--- Datos del visitante ---',
    );
    const description = (rawDescription || '').trim();
    const nameMatch = visitorBlock?.match(/Nombre:\s*(.*?)\s*Tel[eé]fono:/i);
    const phoneMatch = visitorBlock?.match(/Tel[eé]fono:\s*(.*)/i);

    const visitorHtml = `
    <div style="margin-top:12px;font-size:13px;">
      <strong>Reporta:</strong>
      <div>Nombre: ${nameMatch?.[1]?.trim() ?? 'No disponible'}</div>
      <div>Teléfono: ${phoneMatch?.[1]?.trim() ?? 'No disponible'}</div>
    </div>`;

    const subject = `[INCIDENTE NUEVO] ${incidentNumber} - ${incidentBuilding}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Incidente #${incidentNumber}</h3>
      <div style="font-size:13px;color:#555;">
        <div><strong>Edificio:</strong> ${incidentBuilding}</div>
        <div><strong>Ubicación:</strong> ${incidentLocation}</div>
        <div><strong>Prioridad:</strong>
          <span style="color:${priority.color};font-weight:bold;">${priority.text}</span>
        </div>
        <div><strong>Fecha:</strong> ${new Date(incidentCreatedAt).toLocaleString('es-EC')}</div>
      </div>
      <hr style="margin:12px 0;" />
      <div style="font-size:13px;">
        <strong>Descripción</strong>
        <p style="margin:6px 0;white-space:pre-wrap;">${description || 'Sin descripción'}</p>
      </div>
      ${visitorHtml}
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>`;

    const attachments = (incidentImages || []).map((img, index) => ({
      filename: `imagen-${index + 1}.jpg`,
      content: img.replace(/^data:image\/\w+;base64,/, ''),
      contentType: 'image/jpeg',
    }));

    const recipients =
      process.env.INCIDENT_NOTIFICATION_EMAIL?.split(',')
        .map((e) => e.trim())
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

  async notifyIncidentFinished(
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
    const subject = `[INCIDENTE RESUELTO] ${incidentNumber} - ${incidentBuilding}`;

    const html = getTemplateCompleteIncident({
      incidentNumber,
      incidentLocation,
      incidentBuilding,
      incidentPriority,
      incidentCreatedAt,
      incidentNotes,
    });

    const attachments = (incidentImages || []).map((img, index) => ({
      filename: `imagen-${index + 1}.jpg`,
      content: img.replace(/^data:image\/\w+;base64,/, ''),
      contentType: 'image/jpeg',
    }));

    const recipients = ['andersoncango09@gmail.com'];

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

  async verifyMailProvider(): Promise<{ ok: boolean }> {
    const ok = await this.mailerService.verifyProvider();
    if (!ok) {
      throw new ServiceUnavailableException({
        ok,
        message: 'El proveedor de correo no esta disponible',
      });
    }
    return { ok };
  }

  async diagnoseSMTP(): Promise<Record<string, unknown>> {
    const config = {
      host: this.configService.get<string>('SMTP_HOST') ?? '(no definido)',
      port: this.configService.get<string>('SMTP_PORT') ?? '(no definido)',
      secure: this.configService.get<string>('SMTP_SECURE') ?? '(no definido)',
      user: this.configService.get<string>('SMTP_USER') ?? '(no definido)',
      from: this.configService.get<string>('SMTP_FROM') ?? '(no definido)',
    };

    let connection: 'ok' | 'failed' = 'failed';
    let connectionError: string | null = null;

    try {
      connection = (await this.mailerService.verifyProvider())
        ? 'ok'
        : 'failed';
    } catch (err) {
      connectionError = err instanceof Error ? err.message : String(err);
    }

    return {
      config,
      connection,
      ...(connectionError ? { connectionError } : {}),
    };
  }

  // ─── Resolución de plantilla (usado por sendBulk legacy) ─────────────────

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
      if (error instanceof NotFoundException) throw error;
      this.logger.error('Error al obtener la plantilla de openMAINT', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudo obtener la plantilla seleccionada',
      );
    }
  }

  // ─── Sesión de servicio ───────────────────────────────────────────────────

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

