import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { MailerService } from '../notifications/mail/mailer.service';
import { type MailMessage } from '../notifications/mail/mail-provider.interface';

const OPENMAINT_PAYMENTS_CLASS = 'Pagos';
const OPENMAINT_CONTACT_CLASS = 'Contact';
const ADMIN_CONTACT_DESCRIPTION = 'administrador';

/** Card de Pagos tal como la devuelve openMAINT (atributos usados en el correo). */
interface PagoDetail {
  _id: number;
  Unidad: string | null;
  Periodo: string | null;
  Monto: number | null;
  _Propietario_description: string | null;
  _MetododoPago_description: string | null;
  FechadePago: string | null;
}

interface ContactCard {
  _id: number;
  Description: string | null;
  Email: string | null;
}

export interface PaidNotificationResult {
  notified: boolean;
  reason?: string;
  to?: string;
  pagos: number;
}

/**
 * Notifica al administrador cuando un propietario registra un pago exitoso.
 *
 * Responsabilidad única: dado el conjunto de pagos marcados como Pagado,
 * resolver el correo del administrador (clase Contact de openMAINT) y enviarle
 * un correo consolidado con el detalle. Es best-effort: cualquier fallo se
 * loguea y NO afecta el resultado del pago. El envío queda registrado en
 * HistorialEmail vía MailerService.
 */
@Injectable()
export class PaymentPaidNotifierService {
  private readonly logger = new Logger(PaymentPaidNotifierService.name);

  constructor(
    private readonly openmaintClient: OpenmaintClient,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Envía al administrador el aviso de los pagos recién marcados como Pagado.
   * @param paidPaymentIds IDs de pagos exitosos en la operación.
   * @param sessionId sesión de servicio ya obtenida por el llamador.
   */
  async notifyPaidPayments(
    paidPaymentIds: number[],
    sessionId: string,
  ): Promise<PaidNotificationResult> {
    if (paidPaymentIds.length === 0) {
      return { notified: false, reason: 'Sin pagos exitosos', pagos: 0 };
    }

    const adminEmail = await this.resolveAdminEmail(sessionId);
    if (!adminEmail) {
      const reason =
        'No se encontró un Contact "Administrador" con email - no se notifica';
      this.logger.warn(`[PaidNotifier] ${reason}`);
      return { notified: false, reason, pagos: paidPaymentIds.length };
    }

    const detalles = await this.getPagosDetail(paidPaymentIds, sessionId);
    if (detalles.length === 0) {
      const reason = 'No se pudieron leer los detalles de los pagos';
      this.logger.warn(`[PaidNotifier] ${reason}`);
      return { notified: false, reason, pagos: paidPaymentIds.length };
    }

    const message = this.buildEmail(detalles, adminEmail);

    try {
      const result = await this.mailerService.sendOne(message);
      if (result.success) {
        this.logger.log(
          `[PaidNotifier] Aviso enviado a ${adminEmail} (${detalles.length} pago/s)`,
        );
        return { notified: true, to: adminEmail, pagos: detalles.length };
      }
      this.logger.warn(
        `[PaidNotifier] Falló el envío a ${adminEmail}: ${result.error ?? 'desconocido'}`,
      );
      return {
        notified: false,
        reason: result.error ?? 'Falló el envío',
        to: adminEmail,
        pagos: detalles.length,
      };
    } catch (error) {
      this.logger.error(
        `[PaidNotifier] Error enviando aviso de pago: ${(error as Error).message}`,
      );
      return {
        notified: false,
        reason: (error as Error).message,
        to: adminEmail,
        pagos: detalles.length,
      };
    }
  }

  /**
   * Busca en la clase Contact el registro cuyo Description sea "Administrador"
   * y devuelve su Email. Best-effort: ante un fallo devuelve null.
   */
  private async resolveAdminEmail(sessionId: string): Promise<string | null> {
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_CONTACT_CLASS}/cards?limit=9999`,
        sessionId,
      )) as { data?: ContactCard[] };

      const admin = (response?.data ?? []).find(
        (c) =>
          c.Description?.trim().toLowerCase() === ADMIN_CONTACT_DESCRIPTION &&
          c.Email?.trim(),
      );

      return admin?.Email?.trim() ?? null;
    } catch (error) {
      this.logger.warn(
        `[PaidNotifier] No se pudo resolver el contacto Administrador: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Lee el detalle de cada pago exitoso. Omite los que no se puedan leer. */
  private async getPagosDetail(
    paymentIds: number[],
    sessionId: string,
  ): Promise<PagoDetail[]> {
    const detalles: PagoDetail[] = [];

    for (const id of paymentIds) {
      try {
        const response = (await this.openmaintClient.get(
          `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards/${id}`,
          sessionId,
        )) as { data?: PagoDetail };

        if (response?.data) {
          detalles.push(response.data);
        }
      } catch (error) {
        this.logger.warn(
          `[PaidNotifier] No se pudo leer el pago ${id}: ${(error as Error).message}`,
        );
      }
    }

    return detalles;
  }

  /** Arma el correo consolidado dirigido al administrador. */
  private buildEmail(detalles: PagoDetail[], to: string): MailMessage {
    const total = detalles.reduce(
      (acc, d) => acc + (typeof d.Monto === 'number' ? d.Monto : 0),
      0,
    );
    const propietario = detalles[0]?._Propietario_description ?? '—';
    const cantidad = detalles.length;

    const filas = detalles
      .map(
        (d) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d._Propietario_description ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d.Unidad ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d.Periodo ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d._MetododoPago_description ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;">${d.FechadePago ?? '—'}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${this.formatMonto(d.Monto)}</td>
          </tr>`,
      )
      .join('');

    const subject =
      cantidad > 1
        ? `Pago registrado — ${cantidad} expensas (${propietario})`
        : `Pago registrado — ${propietario}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Pago registrado</h3>
      <div style="font-size:13px;color:#555;">
        <p style="margin:6px 0;">
          El propietario <strong>${propietario}</strong> registró el pago de
          ${cantidad === 1 ? 'una expensa' : `${cantidad} expensas`}.
          A continuación el detalle:
        </p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f7f7f7;">
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Propietario</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Unidad</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Período</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Método</th>
            <th style="padding:6px 8px;text-align:left;border-bottom:2px solid #ddd;">Fecha</th>
            <th style="padding:6px 8px;text-align:right;border-bottom:2px solid #ddd;">Monto</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="padding:8px;text-align:right;font-weight:bold;">Total:</td>
            <td style="padding:8px;text-align:right;font-weight:bold;">${this.formatMonto(total)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>`;

    return { to, subject, html };
  }

  private formatMonto(monto: number | null): string {
    if (typeof monto !== 'number' || Number.isNaN(monto)) return '$0.00';
    return `$${monto.toFixed(2)}`;
  }
}
