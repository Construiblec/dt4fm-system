import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../notifications/mail/mailer.service';
import { type MailMessage } from '../notifications/mail/mail-provider.interface';
import {
  ConfigExpensa,
  PagoCard,
  PaymentsOpenmaintRepository,
} from './payments-openmaint.repository';

/** Días del mes en que se envía el aviso. */
export const OVERDUE_NOTICE_DAYS = [1, 15];

export interface OverdueNoticeResult {
  /** Fecha en que se ejecutó, YYYY-MM-DD. */
  fecha: string;
  /** Propietarios con al menos un pago ya vencido. */
  propietariosConVencidos: number;
  /** Propietarios a los que se les armó (intentó enviar) un correo. */
  propietariosNotificados: number;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
  errors: string[];
  skippedReason?: string;
}

interface OverdueByTenant {
  propietarioId: number;
  pagos: PagoCardVencido[];
  totalVencido: number;
}

/** Pago pendiente cuya fecha de vencimiento ya pasó. */
interface PagoCardVencido extends PagoCard {
  vencimiento: Date;
}

/**
 * Aviso de valores vencidos.
 *
 * Responsabilidad única: dos veces al mes (día 1 y día 15) avisa a cada
 * propietario de lo que tiene VENCIDO, con su fecha de vencimiento y la
 * advertencia de que genera multa por mora.
 *
 * Se diferencia de `PaymentReminderService` en dos cosas:
 * - Aquel avisa ANTES del vencimiento (un día antes); este avisa DESPUÉS.
 * - Aquel lista todo lo pendiente; este solo lo que ya venció.
 *
 * El aviso de mora es únicamente informativo: NO calcula monto ni porcentaje,
 * porque esos datos no existen en OpenMAINT (`ConfigExpensa` solo tiene
 * `DiaEmision`, `DiaVencimiento` y `Tiempo`). Si algún día se agregan, el
 * cálculo entra en `buildNoticeEmail` leyéndolos de la configuración, nunca
 * codificados aquí.
 */
@Injectable()
export class OverdueNoticeService {
  private readonly logger = new Logger(OverdueNoticeService.name);

  constructor(
    private readonly repo: PaymentsOpenmaintRepository,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Envía los avisos si hoy es día de aviso.
   * Con `force=true` se saltea la validación de fecha, para pruebas manuales.
   */
  async sendOverdueNotices(force = false): Promise<OverdueNoticeResult> {
    const hoy = new Date();
    const result: OverdueNoticeResult = {
      fecha: this.toIsoDate(hoy),
      propietariosConVencidos: 0,
      propietariosNotificados: 0,
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkipped: 0,
      errors: [],
    };

    this.logger.log(
      `[Mora] Iniciando verificación ${result.fecha}${force ? ' (FORCE)' : ''}`,
    );

    if (!force && !OVERDUE_NOTICE_DAYS.includes(hoy.getDate())) {
      const msg =
        `Hoy (día ${hoy.getDate()}) no es día de aviso ` +
        `(${OVERDUE_NOTICE_DAYS.join(' y ')}) - no se notifica`;
      this.logger.log(`[Mora] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    const sessionId = await this.repo.getSession();

    const config = await this.repo.getConfigExpensa(sessionId);
    if (!config?.DiaVencimiento) {
      const msg =
        'No se encontró DiaVencimiento en ConfigExpensa - no se puede ' +
        'determinar qué está vencido';
      this.logger.warn(`[Mora] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    const pendientes = await this.repo.getPendingPayments(sessionId);
    const vencidos = this.filterOverdue(pendientes, config, hoy);

    if (vencidos.length === 0) {
      this.logger.log('[Mora] No hay pagos vencidos - nada que notificar');
      return result;
    }

    const grupos = this.groupByTenant(vencidos);
    result.propietariosConVencidos = grupos.length;

    const emailByTenant = await this.repo.getTenantsEmailMap(sessionId);
    const notifications: MailMessage[] = [];

    for (const grupo of grupos) {
      const email = emailByTenant.get(grupo.propietarioId)?.trim();
      if (!email) {
        result.emailsSkipped++;
        this.logger.warn(
          `[Mora] Propietario ${grupo.propietarioId} sin email - no se notifica ` +
            `(${grupo.pagos.length} vencidos)`,
        );
        continue;
      }

      notifications.push(this.buildNoticeEmail(grupo, email));
      result.propietariosNotificados++;
    }

    if (notifications.length > 0) {
      try {
        const summary = await this.mailerService.sendBulk(notifications);
        result.emailsSent = summary.sent;
        result.emailsFailed = summary.failed;
        this.logger.log(
          `[Mora] Avisos -> enviados:${summary.sent} fallidos:${summary.failed} de ${summary.total}`,
        );
      } catch (error) {
        result.emailsFailed += notifications.length;
        const msg = `Error enviando avisos de mora: ${(error as Error).message}`;
        result.errors.push(msg);
        this.logger.error(`[Mora] ${msg}`);
      }
    }

    this.logger.log(
      `[Mora] Completado ${result.fecha} -> propietariosConVencidos:${result.propietariosConVencidos} ` +
        `notificados:${result.propietariosNotificados} ` +
        `correos[enviados:${result.emailsSent} fallidos:${result.emailsFailed} sinEmail:${result.emailsSkipped}]`,
    );

    return result;
  }

  /**
   * Se queda solo con los pagos cuya fecha de vencimiento ya pasó.
   *
   * "Pendiente" no es lo mismo que "vencido": la expensa del mes en curso está
   * pendiente pero todavía no vence. `Pagos` no guarda la fecha de vencimiento,
   * así que se deriva del `Periodo` (YYYY-MM) más el `DiaVencimiento`.
   */
  private filterOverdue(
    pendientes: PagoCard[],
    config: ConfigExpensa,
    hoy: Date,
  ): PagoCardVencido[] {
    const inicioDeHoy = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      hoy.getDate(),
    );

    const vencidos: PagoCardVencido[] = [];

    for (const pago of pendientes) {
      const vencimiento = this.resolveVencimiento(
        pago.Periodo,
        config.DiaVencimiento,
      );

      // Sin período legible no hay forma de saber si venció: se omite en vez de
      // arriesgar un aviso de mora sobre algo que quizá no está vencido.
      if (!vencimiento) {
        this.logger.warn(
          `[Mora] Pago ${pago._id ?? '?'} con periodo ilegible ("${pago.Periodo}") - se omite`,
        );
        continue;
      }

      if (vencimiento < inicioDeHoy) {
        vencidos.push({ ...pago, vencimiento });
      }
    }

    return vencidos;
  }

  /** Fecha de vencimiento a partir del período y el día configurado. */
  private resolveVencimiento(
    periodo: string | undefined,
    diaVencimiento: number,
  ): Date | null {
    const [year, month] = (periodo ?? '').split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      return null;
    }
    return new Date(year, month - 1, diaVencimiento);
  }

  /** Agrupa por propietario y suma el total vencido. */
  private groupByTenant(vencidos: PagoCardVencido[]): OverdueByTenant[] {
    const map = new Map<number, OverdueByTenant>();

    for (const pago of vencidos) {
      if (pago.Propietario == null) {
        continue;
      }
      const monto = typeof pago.Monto === 'number' ? pago.Monto : 0;
      const existing = map.get(pago.Propietario);

      if (existing) {
        existing.pagos.push(pago);
        existing.totalVencido += monto;
      } else {
        map.set(pago.Propietario, {
          propietarioId: pago.Propietario,
          pagos: [pago],
          totalVencido: monto,
        });
      }
    }

    // Los más antiguos primero, que es el orden en que conviene leerlos.
    for (const grupo of map.values()) {
      grupo.pagos.sort((a, b) => a.vencimiento.getTime() - b.vencimiento.getTime());
    }

    return [...map.values()];
  }

  /**
   * Correo con el detalle de lo vencido y la advertencia de mora.
   *
   * La advertencia es informativa: menciona que los valores vencidos generan
   * multa, sin cifras, porque el porcentaje no está configurado en OpenMAINT.
   */
  private buildNoticeEmail(grupo: OverdueByTenant, to: string): MailMessage {
    const hoy = new Date();

    const filas = grupo.pagos
      .map((pago) => {
        const diasVencido = Math.floor(
          (hoy.getTime() - pago.vencimiento.getTime()) / 86_400_000,
        );
        return `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${pago.Description ?? '-'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${pago.Periodo ?? '-'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${this.formatFecha(pago.vencimiento)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#c0392b;">${diasVencido}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${this.formatMonto(pago.Monto)}</td>
          </tr>`;
      })
      .join('');

    const cantidad = grupo.pagos.length;
    const totalFmt = this.formatMonto(grupo.totalVencido);

    const subject =
      cantidad > 1
        ? `Valores vencidos — ${cantidad} expensas pendientes de pago`
        : `Valor vencido — expensa ${grupo.pagos[0].Periodo ?? ''}`.trim();

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Aviso de valores vencidos</h3>
      <div style="font-size:13px;color:#555;">
        <p style="margin:6px 0;">
          Le informamos que registra ${cantidad === 1 ? 'un valor vencido' : `${cantidad} valores vencidos`}
          por un total de <strong>${totalFmt}</strong>. A continuación el detalle
          con su respectiva fecha de vencimiento.
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Unidad</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Período</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Venció el</th>
            <th style="padding:6px 8px;text-align:center;border-bottom:2px solid #ddd;">Días</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd;">Monto</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:8px;text-align:right;font-weight:bold;">Total vencido:</td>
            <td style="padding:8px;text-align:right;font-weight:bold;">${totalFmt}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:16px;padding:12px;border-left:4px solid #e67e22;background:#fdf3e7;font-size:13px;color:#7a4b12;">
        <strong>Multa por mora</strong><br />
        Los valores vencidos generan multa por mora conforme al reglamento
        vigente. Le solicitamos regularizar el pago a la brevedad para evitar
        recargos adicionales.
      </div>

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

  /** "DD/MM/YYYY" */
  private formatFecha(fecha: Date): string {
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${fecha.getFullYear()}`;
  }

  /** "YYYY-MM-DD" en hora local, sin pasar por UTC. */
  private toIsoDate(fecha: Date): string {
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${mm}-${dd}`;
  }
}
