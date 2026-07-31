import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../notifications/mail/mailer.service';
import { type MailMessage } from '../notifications/mail/mail-provider.interface';
import {
  ConfigExpensa,
  PagoCard,
  PaymentsOpenmaintRepository,
} from './payments-openmaint.repository';

export interface ReminderGenerationResult {
  periodo: string;
  /** Propietarios con al menos un pago pendiente encontrado. */
  propietariosConPendientes: number;
  /** Propietarios a los que se les armó (intentó enviar) un correo. */
  propietariosNotificados: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  errors: string[];
  skippedReason?: string;
}

interface PendingByTenant {
  propietarioId: number;
  pagos: PagoCard[];
  totalAdeudado: number;
}

/**
 * Envío de recordatorios de vencimiento.
 *
 * Responsabilidad única: un día antes del vencimiento configurado
 * (ConfigExpensa.DiaVencimiento − 1) notifica a cada propietario, mediante un
 * correo consolidado, el pago del período actual junto con cualquier otro pago
 * que tenga pendiente.
 *
 * No genera pagos ni conoce el proveedor de correo: arma los MailMessage y
 * delega el envío en MailerService (que además registra en HistorialEmail).
 * El acceso a openMAINT vive en PaymentsOpenmaintRepository.
 */
@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    private readonly repo: PaymentsOpenmaintRepository,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Envía recordatorios si hoy corresponde (un día antes del vencimiento).
   * Con `force=true` se saltea la validación de fecha (útil para pruebas
   * manuales vía endpoint).
   */
  async sendDueReminders(
    periodo: string,
    force = false,
  ): Promise<ReminderGenerationResult> {
    this.logger.log(
      `[Reminders] Iniciando verificación para periodo ${periodo}${force ? ' (FORCE)' : ''}`,
    );

    const result: ReminderGenerationResult = {
      periodo,
      propietariosConPendientes: 0,
      propietariosNotificados: 0,
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkipped: 0,
      errors: [],
    };

    const sessionId = await this.repo.getSession();

    const config = await this.repo.getConfigExpensa(sessionId);
    if (!config) {
      const msg = 'No se encontró configuración en ConfigExpensa';
      this.logger.warn(`[Reminders] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    if (!force && !this.isReminderDay(periodo, config)) {
      const msg =
        `Hoy no coincide con el recordatorio (un día antes del ` +
        `DiaVencimiento ${config.DiaVencimiento}) - no se notifica`;
      this.logger.log(`[Reminders] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    this.logger.log(
      `[Reminders] Día de recordatorio confirmado - procediendo para ${periodo}`,
    );

    const pendientes = await this.repo.getPendingPayments(sessionId);
    if (pendientes.length === 0) {
      this.logger.log(
        '[Reminders] No hay pagos pendientes - nada que notificar',
      );
      return result;
    }

    const grupos = this.groupByTenant(pendientes);
    result.propietariosConPendientes = grupos.length;

    const emailByTenant = await this.repo.getTenantsEmailMap(sessionId);

    const notifications: MailMessage[] = [];

    for (const grupo of grupos) {
      const email = emailByTenant.get(grupo.propietarioId)?.trim();
      if (!email) {
        result.emailsSkipped++;
        this.logger.warn(
          `[Reminders] Propietario ${grupo.propietarioId} sin email - no se notifica (${grupo.pagos.length} pendientes)`,
        );
        continue;
      }

      notifications.push(
        this.buildReminderEmail(grupo, periodo, config, email),
      );
      result.propietariosNotificados++;
    }

    if (notifications.length > 0) {
      try {
        const summary = await this.mailerService.sendBulk(notifications);
        result.emailsSent = summary.sent;
        result.emailsFailed = summary.failed;
        this.logger.log(
          `[Reminders] Notificaciones -> enviadas:${summary.sent} fallidas:${summary.failed} de ${summary.total}`,
        );
      } catch (error) {
        result.emailsFailed += notifications.length;
        const msg = `Error enviando recordatorios: ${(error as Error).message}`;
        result.errors.push(msg);
        this.logger.error(`[Reminders] ${msg}`);
      }
    }

    this.logger.log(
      `[Reminders] Completado ${periodo} -> propietariosConPendientes:${result.propietariosConPendientes} ` +
        `notificados:${result.propietariosNotificados} ` +
        `correos[enviados:${result.emailsSent} fallidos:${result.emailsFailed} sinEmail:${result.emailsSkipped}]`,
    );

    return result;
  }

  /**
   * Determina si hoy es el día de recordatorio: un día antes de la fecha de
   * vencimiento del período actual. Se calcula con Date real para resolver
   * bien los bordes de mes (p.ej. DiaVencimiento=1 => último día del mes previo).
   */
  private isReminderDay(periodo: string, config: ConfigExpensa): boolean {
    const [year, month] = periodo.split('-').map(Number);
    if (!year || !month || !config.DiaVencimiento) {
      return false;
    }

    // Fecha de vencimiento del período actual.
    const vencimiento = new Date(year, month - 1, config.DiaVencimiento);
    // Recordatorio: un día antes.
    const reminderDate = new Date(vencimiento);
    reminderDate.setDate(reminderDate.getDate() - 1);

    const today = new Date();
    return (
      today.getFullYear() === reminderDate.getFullYear() &&
      today.getMonth() === reminderDate.getMonth() &&
      today.getDate() === reminderDate.getDate()
    );
  }

  /** Agrupa los pagos pendientes por propietario y calcula el total adeudado. */
  private groupByTenant(pendientes: PagoCard[]): PendingByTenant[] {
    const map = new Map<number, PendingByTenant>();

    for (const pago of pendientes) {
      if (pago.Propietario == null) {
        continue;
      }
      const existing = map.get(pago.Propietario);
      const monto = typeof pago.Monto === 'number' ? pago.Monto : 0;

      if (existing) {
        existing.pagos.push(pago);
        existing.totalAdeudado += monto;
      } else {
        map.set(pago.Propietario, {
          propietarioId: pago.Propietario,
          pagos: [pago],
          totalAdeudado: monto,
        });
      }
    }

    return [...map.values()];
  }

  /**
   * Arma el correo consolidado para un propietario: lista todos sus pagos
   * pendientes (período actual + arrastrados) con monto y vencimiento, más el
   * total adeudado.
   */
  private buildReminderEmail(
    grupo: PendingByTenant,
    periodo: string,
    config: ConfigExpensa,
    to: string,
  ): MailMessage {
    const filas = grupo.pagos
      .map((p) => {
        const esActual = p.Periodo === periodo;
        const vencimiento = this.formatVencimiento(
          p.Periodo,
          config.DiaVencimiento,
        );
        const monto = this.formatMonto(p.Monto);
        const etiqueta = esActual
          ? ' <span style="color:#c0392b;font-size:11px;">(vence mañana)</span>'
          : '';
        return `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${p.Description ?? '-'}${etiqueta}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${p.Periodo ?? '-'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${vencimiento}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${monto}</td>
          </tr>`;
      })
      .join('');

    const totalFmt = this.formatMonto(grupo.totalAdeudado);
    const cantidad = grupo.pagos.length;

    const subject =
      cantidad > 1
        ? `Recordatorio de pago — ${cantidad} expensas pendientes`
        : `Recordatorio de pago — expensa ${periodo}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Recordatorio de pago</h3>
      <div style="font-size:13px;color:#555;">
        <p style="margin:6px 0;">
          Le recordamos que tiene ${cantidad === 1 ? 'una expensa pendiente' : `${cantidad} expensas pendientes`}.
          La expensa del período ${periodo} vence mañana. Por favor realice el pago
          antes de la fecha de vencimiento.
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Unidad</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Período</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Vencimiento</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd;">Monto</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:8px;text-align:right;font-weight:bold;">Total adeudado:</td>
            <td style="padding:8px;text-align:right;font-weight:bold;">${totalFmt}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>`;

    return { to, subject, html };
  }

  private formatMonto(monto?: number): string {
    if (typeof monto !== 'number' || Number.isNaN(monto)) return '$0.00';
    return `$${monto.toFixed(2)}`;
  }

  /**
   * Construye la fecha de vencimiento "DD/MM/YYYY" a partir del período
   * (YYYY-MM) y el día configurado.
   */
  private formatVencimiento(periodo: string, diaVencimiento: number): string {
    const [year, month] = (periodo ?? '').split('-').map(Number);
    if (!year || !month || !diaVencimiento) {
      return diaVencimiento ? `Día ${diaVencimiento}` : 'Por confirmar';
    }
    const dd = String(diaVencimiento).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${dd}/${mm}/${year}`;
  }
}
