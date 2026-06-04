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
  async sendBulk(dto: SendBulkDto): Promise<BulkSendSummary & { template: string }> {
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

  // ─── Diagnóstico ──────────────────────────────────────────────────────────

  /** Verifica que el proveedor de correo configurado responda. */
  async verifyMailProvider(): Promise<{ ok: boolean }> {
    const ok = await this.mailerService.verifyProvider();
    return { ok };
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
    const seen = new Set<string>();
    const recipients: ResolvedRecipient[] = [];

    for (const card of cards) {
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

    return recipients;
  }

  /**
   * Construye el path REST con el filtro CQL/JSON según el alcance.
   *
   * Los códigos de OccupancyType para propietarios/arrendatarios se leen
   * de configuración (OPENMAINT_OCCUPANCY_OWNER_CODE /
   * OPENMAINT_OCCUPANCY_TENANT_CODE) para no acoplar el código a IDs de
   * lookup concretos de la instancia de openMAINT.
   */
  private buildTenantPath(scope: RecipientScope): string {
    const base = `/classes/Tenant/cards?attrs=${encodeURIComponent(
      JSON.stringify(['Description', 'Email', 'OccupancyType']),
    )}&limit=1000`;

    if (scope === RecipientScope.ALL) {
      return base;
    }

    const occupancyCode =
      scope === RecipientScope.OWNERS
        ? this.configService.get<string>('OPENMAINT_OCCUPANCY_OWNER_CODE')
        : this.configService.get<string>('OPENMAINT_OCCUPANCY_TENANT_CODE');

    if (!occupancyCode) {
      this.logger.warn(
        `No hay código de OccupancyType configurado para scope=${scope}; ` +
          `se enviará a todos los Tenant. Configure ` +
          `OPENMAINT_OCCUPANCY_OWNER_CODE / OPENMAINT_OCCUPANCY_TENANT_CODE.`,
      );
      return base;
    }

    const filter = encodeURIComponent(
      JSON.stringify({
        attribute: {
          simple: {
            attribute: 'OccupancyType',
            operator: 'equal',
            value: occupancyCode,
          },
        },
      }),
    );

    return `${base}&filter=${filter}`;
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
