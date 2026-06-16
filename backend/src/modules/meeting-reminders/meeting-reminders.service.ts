import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { MailerService } from '../notifications/mail/mailer.service';
import { type MailMessage } from '../notifications/mail/mail-provider.interface';

const DEFAULT_DAYS_BEFORE = 3;

// ─── Tipos de las cards de openMAINT ──────────────────────────────────────────

type MeetingCard = {
  _id: number;
  Description: string | null;
  FechaDeReunion: string | null;
  Asunto: string | null;
  Edificio: number | null;
  _Edificio_description: string | null;
  TipoDeArrendatario: number | null;
  _TipoDeArrendatario_description: string | null;
};

type TenantCard = {
  _id: number;
  Description: string | null;
  Email: string | null;
  Edficio: number | null; // ⚠ así está escrito el atributo en openMAINT (sin la "i")
  OccupancyType: number | null;
};

type CardsResponse<T> = {
  data?: T[];
  meta?: { total: number };
};

// ─── Resumen del job ──────────────────────────────────────────────────────────

export type MeetingReminderResult = {
  meetingId: number;
  asunto: string | null;
  edificio: string | null;
  fechaReunion: string | null;
  recipients: string[];
  sent: number;
  failed: number;
};

export type MeetingReminderSummary = {
  daysBefore: number;
  meetingsTotal: number;
  meetingsMatched: number;
  dryRun: boolean;
  details: MeetingReminderResult[];
};

/**
 * Recordatorio automático de reuniones.
 *
 * Flujo:
 *   1. Consulta la clase `Reuniones` en openMAINT.
 *   2. Filtra las reuniones cuya `FechaDeReunion` cae exactamente a N días
 *      (MEETING_REMINDER_DAYS_BEFORE, defecto 3) de hoy.
 *   3. Para cada reunión, consulta la clase `Tenant` y selecciona a los que
 *      coinciden por Edificio (Tenant.Edficio === Reunion.Edificio) y por
 *      tipo de ocupación (Tenant.OccupancyType === Reunion.TipoDeArrendatario).
 *   4. Envía un correo de recordatorio a todos los coincidentes usando el
 *      Asunto, la descripción del edificio y las notas de la reunión.
 */
@Injectable()
export class MeetingRemindersService {
  private readonly logger = new Logger(MeetingRemindersService.name);
  private readonly timeZone: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintClient: OpenmaintClient,
    private readonly mailerService: MailerService,
  ) {
    // openMAINT guarda en UTC pero muestra/opera en hora local. Usamos la
    // misma zona para formatear y para el cálculo de "faltan N días".
    this.timeZone =
      this.configService.get<string>('CALENDAR_TIMEZONE') ??
      'America/Guayaquil';
  }

  // ─── Orquestación del job ───────────────────────────────────────────────────

  /**
   * Ejecuta el flujo completo. `daysBefore` permite forzar un valor distinto
   * al configurado (útil para pruebas). `dryRun` calcula los destinatarios
   * pero NO envía correos.
   */
  async runReminderJob(
    options: { daysBefore?: number; dryRun?: boolean } = {},
  ): Promise<MeetingReminderSummary> {
    const daysBefore = options.daysBefore ?? this.getConfiguredDaysBefore();
    const dryRun = options.dryRun ?? false;

    const sessionId = await this.getAdminSessionId();

    const meetings = await this.getMeetings(sessionId);
    this.logger.log(
      `[meeting-reminders] ${meetings.length} reuniones obtenidas. ` +
        `Buscando las que faltan ${daysBefore} día(s)...`,
    );

    const matched = meetings.filter(
      (m) => this.daysUntil(m.FechaDeReunion) === daysBefore,
    );

    if (matched.length === 0) {
      this.logger.log(
        '[meeting-reminders] Ninguna reunión cumple la ventana de recordatorio.',
      );
      return {
        daysBefore,
        meetingsTotal: meetings.length,
        meetingsMatched: 0,
        dryRun,
        details: [],
      };
    }

    // Los tenants se consultan una sola vez y se reutilizan por cada reunión.
    const tenants = await this.getTenants(sessionId);

    const details: MeetingReminderResult[] = [];

    for (const meeting of matched) {
      const recipients = this.resolveRecipients(meeting, tenants);

      if (recipients.length === 0) {
        this.logger.warn(
          `[meeting-reminders] Reunión #${meeting._id} ("${meeting.Asunto}") ` +
            `sin destinatarios que coincidan (edificio=${meeting.Edificio}, ` +
            `tipo=${meeting.TipoDeArrendatario}).`,
        );
        details.push({
          meetingId: meeting._id,
          asunto: meeting.Asunto,
          edificio: meeting._Edificio_description,
          fechaReunion: meeting.FechaDeReunion,
          recipients: [],
          sent: 0,
          failed: 0,
        });
        continue;
      }

      let sent = 0;
      let failed = 0;

      if (!dryRun) {
        const messages = this.buildMessages(meeting, recipients);
        const summary = await this.mailerService.sendBulk(messages);
        sent = summary.sent;
        failed = summary.failed;
      }

      this.logger.log(
        `[meeting-reminders] Reunión #${meeting._id} ("${meeting.Asunto}") → ` +
          `${recipients.length} destinatario(s)` +
          (dryRun ? ' [dryRun, sin envío]' : ` — enviados:${sent} fallidos:${failed}`),
      );

      details.push({
        meetingId: meeting._id,
        asunto: meeting.Asunto,
        edificio: meeting._Edificio_description,
        fechaReunion: meeting.FechaDeReunion,
        recipients,
        sent,
        failed,
      });
    }

    return {
      daysBefore,
      meetingsTotal: meetings.length,
      meetingsMatched: matched.length,
      dryRun,
      details,
    };
  }

  // ─── Consultas a openMAINT ──────────────────────────────────────────────────

  private async getMeetings(sessionId: string): Promise<MeetingCard[]> {
    const response = (await this.openmaintClient.get(
      '/classes/Reuniones/cards?onlyGridAttrs=true&start=0&limit=1000',
      sessionId,
    )) as CardsResponse<MeetingCard>;

    return response.data ?? [];
  }

  private async getTenants(sessionId: string): Promise<TenantCard[]> {
    const response = (await this.openmaintClient.get(
      '/classes/Tenant/cards?onlyGridAttrs=true&start=0&limit=1000',
      sessionId,
    )) as CardsResponse<TenantCard>;

    return response.data ?? [];
  }

  // ─── Cruce reunión ↔ tenants ────────────────────────────────────────────────

  /**
   * Selecciona los correos de los tenants que coinciden con la reunión por
   * edificio y tipo de ocupación. Deduplica (case-insensitive) y descarta
   * correos vacíos o nulos.
   */
  private resolveRecipients(
    meeting: MeetingCard,
    tenants: TenantCard[],
  ): string[] {
    const seen = new Set<string>();
    const recipients: string[] = [];

    for (const tenant of tenants) {
      const sameBuilding =
        meeting.Edificio != null && tenant.Edficio === meeting.Edificio;
      const sameOccupancy =
        meeting.TipoDeArrendatario != null &&
        tenant.OccupancyType === meeting.TipoDeArrendatario;

      if (!sameBuilding || !sameOccupancy) {
        continue;
      }

      const email = tenant.Email?.trim();
      if (!email) {
        continue;
      }

      const normalized = email.toLowerCase();
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      recipients.push(email);
    }

    return recipients;
  }

  // ─── Construcción del correo ────────────────────────────────────────────────

  private buildMessages(
    meeting: MeetingCard,
    recipients: string[],
  ): MailMessage[] {
    const asunto = meeting.Asunto ?? 'Reunión';
    const edificio = meeting._Edificio_description ?? 'su edificio';
    const notas = meeting.Description ?? '';
    const fecha = this.formatDate(meeting.FechaDeReunion);
    const hora = this.formatTime(meeting.FechaDeReunion);

    const subject = `Recordatorio de reunión: ${asunto} — ${edificio}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Recordatorio de reunión</h3>
      <div style="font-size:13px;color:#555;">
        <div><strong>Asunto:</strong> ${asunto}</div>
        <div><strong>Edificio:</strong> ${edificio}</div>
        <div><strong>Fecha:</strong> ${fecha}</div>
        <div><strong>Hora:</strong> ${hora}</div>
      </div>
      ${
        notas
          ? `<hr style="margin:12px 0;" />
      <div style="font-size:13px;">
        <strong>Notas</strong>
        <p style="margin:6px 0;white-space:pre-wrap;">${notas}</p>
      </div>`
          : ''
      }
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>`;

    return recipients.map((to) => ({ to, subject, html }));
  }

  // ─── Utilidades de fecha ────────────────────────────────────────────────────

  /**
   * Días calendario entre hoy y la fecha de la reunión, evaluados en la zona
   * horaria local (CALENDAR_TIMEZONE). openMAINT guarda en UTC pero opera en
   * local, por lo que una reunión a las 19:00 local del día 18 (00:00Z del 19)
   * debe contarse como el día 18. Devuelve NaN si la fecha es inválida.
   */
  private daysUntil(dateIso: string | null): number {
    if (!dateIso) return NaN;

    const target = new Date(dateIso);
    if (Number.isNaN(target.getTime())) return NaN;

    const startToday = this.localMidnightUtc(new Date());
    const startTarget = this.localMidnightUtc(target);

    return Math.round((startTarget - startToday) / 86_400_000);
  }

  /**
   * Devuelve el epoch (ms) de la medianoche del día calendario de `date`
   * en la zona horaria local. Permite restar días sin que la hora interfiera.
   */
  private localMidnightUtc(date: Date): number {
    // 'en-CA' produce el formato YYYY-MM-DD en la zona indicada.
    const [year, month, day] = date
      .toLocaleDateString('en-CA', { timeZone: this.timeZone })
      .split('-')
      .map(Number);
    return Date.UTC(year, month - 1, day);
  }

  private formatDate(dateIso: string | null): string {
    if (!dateIso) return 'Por confirmar';
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) return 'Por confirmar';
    return date.toLocaleDateString('es-EC', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Hora de la reunión en la zona horaria local (CALENDAR_TIMEZONE), igual que
   * la muestra openMAINT. hourCycle 'h23' evita el "24:00" en la medianoche.
   */
  private formatTime(dateIso: string | null): string {
    if (!dateIso) return 'Por confirmar';
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) return 'Por confirmar';
    return date.toLocaleTimeString('es-EC', {
      timeZone: this.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  }

  private getConfiguredDaysBefore(): number {
    const raw = this.configService.get<string>('MEETING_REMINDER_DAYS_BEFORE');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAYS_BEFORE;
  }

  // ─── Sesión de servicio con openMAINT ───────────────────────────────────────

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
