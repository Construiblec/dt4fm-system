import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '../notifications/mail/mailer.service';
import { type MailMessage } from '../notifications/mail/mail-provider.interface';
import {
  ConfigExpensa,
  LOOKUP_ESTADO_PENDIENTE,
  PaymentsOpenmaintRepository,
  TenantAlicuota,
  TIPO_EXPENSA,
} from './payments-openmaint.repository';

export interface PaymentsGenerationResult {
  periodo: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  skippedReason?: string;
  emailsSent: number;
  emailsFailed: number;
  emailsSkipped: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly repo: PaymentsOpenmaintRepository,
    private readonly mailerService: MailerService,
  ) {}

  async generateMonthlyPayments(
    periodo: string,
  ): Promise<PaymentsGenerationResult> {
    this.logger.log(`[Payments] Iniciando verificacion para periodo ${periodo}`);

    const result: PaymentsGenerationResult = {
      periodo,
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkipped: 0,
    };

    const sessionId = await this.repo.getSession();

    const config = await this.repo.getConfigExpensa(sessionId);

    if (!config) {
      const msg = 'No se encontro configuracion en ConfigExpensa';
      this.logger.warn(`[Payments] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    const today = new Date();
    const todayDay = today.getDate();

    if (todayDay !== config.DiaEmision) {
      const msg = `Hoy es dia ${todayDay}, DiaEmision configurado es ${config.DiaEmision} - no se generan pagos`;
      this.logger.log(`[Payments] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    this.logger.log(
      `[Payments] DiaEmision coincide (dia ${config.DiaEmision}) - procediendo a generar pagos para ${periodo}`,
    );

    const tenants = await this.repo.getTenants(sessionId);
    result.total = tenants.length;

    if (tenants.length === 0) {
      this.logger.log('[Payments] Sin unidades activas encontradas');
      return result;
    }

    const pagosExistentes = await this.repo.getPagosDelPeriodo(periodo, sessionId);
    this.logger.log(
      `[Payments] Pagos existentes para ${periodo}: ${pagosExistentes.length}`,
    );

    // Mapa propietarioId -> email para notificar los pagos recién creados.
    const emailByTenant = await this.repo.getTenantsEmailMap(sessionId);

    // Solo notificamos los pagos creados en esta corrida (no los omitidos).
    const notifications: MailMessage[] = [];

    for (const tenant of tenants) {
      try {
        const alreadyExists = pagosExistentes.some(
          (p) =>
            p.Propietario === tenant.propietarioId &&
            p.Description === tenant.unidadNombre,
        );

        if (alreadyExists) {
          this.logger.log(
            `[Payments] Pago de "${tenant.unidadNombre}" (${tenant.propietarioNombre}) para ${periodo} ya existe - omitiendo`,
          );
          result.skipped++;
          continue;
        }

        await this.createPaymentCard(tenant, periodo, sessionId);
        result.created++;
        this.logger.log(
          `[Payments] Pago creado - "${tenant.unidadNombre}" - ${tenant.propietarioNombre} - $${tenant.monto} - ${periodo}`,
        );

        const email = emailByTenant.get(tenant.propietarioId)?.trim();
        if (email) {
          notifications.push(
            this.buildPaymentEmail(tenant, periodo, config, email),
          );
        } else {
          result.emailsSkipped++;
          this.logger.warn(
            `[Payments] "${tenant.unidadNombre}" (${tenant.propietarioNombre}) sin email - no se notifica`,
          );
        }
      } catch (error) {
        const msg = `"${tenant.unidadNombre}" (${tenant.propietarioNombre}): ${(error as Error)?.message ?? 'Error desconocido'}`;
        this.logger.error(`[Payments] ${msg}`);
        result.failed++;
        result.errors.push(msg);
      }
    }

    // Envío de notificaciones (best-effort): NO debe afectar la generación.
    if (notifications.length > 0) {
      try {
        const summary = await this.mailerService.sendBulk(notifications);
        result.emailsSent = summary.sent;
        result.emailsFailed = summary.failed;
        this.logger.log(
          `[Payments] Notificaciones -> enviadas:${summary.sent} fallidas:${summary.failed} de ${summary.total}`,
        );
      } catch (error) {
        result.emailsFailed += notifications.length;
        this.logger.error(
          `[Payments] Error enviando notificaciones de pagos: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `[Payments] Completado ${periodo} -> total:${result.total} creados:${result.created} ` +
        `omitidos:${result.skipped} fallidos:${result.failed} ` +
        `correos[enviados:${result.emailsSent} fallidos:${result.emailsFailed} sinEmail:${result.emailsSkipped}]`,
    );

    return result;
  }

  /**
   * Arma el correo de aviso de expensa para una unidad/pago recién creado.
   * La fecha de vencimiento se calcula con DiaVencimiento de ConfigExpensa.
   */
  private buildPaymentEmail(
    tenant: TenantAlicuota,
    periodo: string,
    config: ConfigExpensa,
    to: string,
  ): MailMessage {
    const montoFmt = this.formatMonto(tenant.monto);
    const vencimiento = this.formatVencimiento(periodo, config.DiaVencimiento);

    const subject = `Aviso de expensa ${periodo} — ${tenant.unidadNombre}`;

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:16px;border:1px solid #eee;border-radius:6px;">
      <h3 style="margin:0 0 10px 0;">Aviso de expensa</h3>
      <div style="font-size:13px;color:#555;">
        <div><strong>Propietario:</strong> ${tenant.propietarioNombre}</div>
        <div><strong>Unidad:</strong> ${tenant.unidadNombre}</div>
        <div><strong>Período:</strong> ${periodo}</div>
        <div><strong>Monto:</strong> ${montoFmt}</div>
        <div><strong>Fecha de vencimiento:</strong> ${vencimiento}</div>
      </div>
      <hr style="margin:12px 0;" />
      <div style="font-size:13px;">
        <p style="margin:6px 0;">
          Se ha generado su expensa correspondiente al período ${periodo}.
          Por favor realice el pago antes de la fecha de vencimiento.
        </p>
      </div>
      <div style="margin-top:16px;font-size:11px;color:#999;text-align:center;">
        Sistema DT4FM - Notificación automática
      </div>
    </div>`;

    return { to, subject, html };
  }

  private formatMonto(monto: number): string {
    if (typeof monto !== 'number' || Number.isNaN(monto)) return '$0.00';
    return `$${monto.toFixed(2)}`;
  }

  /**
   * Construye la fecha de vencimiento "DD/MM/YYYY" a partir del período
   * (YYYY-MM) y el día configurado. Si el período es inválido, devuelve
   * solo el día.
   */
  private formatVencimiento(periodo: string, diaVencimiento: number): string {
    const [year, month] = periodo.split('-').map(Number);
    if (!year || !month || !diaVencimiento) {
      return diaVencimiento ? `Día ${diaVencimiento}` : 'Por confirmar';
    }
    const dd = String(diaVencimiento).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    return `${dd}/${mm}/${year}`;
  }

  private async createPaymentCard(
    tenant: TenantAlicuota,
    periodo: string,
    sessionId: string,
  ): Promise<void> {
    const card = {
      Propietario: tenant.propietarioId,
      Description: tenant.unidadNombre,
      Unidad: tenant.unidadNombre,
      Monto: tenant.monto,
      Periodo: periodo,
      Estado: LOOKUP_ESTADO_PENDIENTE,
      Tipo: TIPO_EXPENSA,
    };

    const id = await this.repo.createPaymentCard(card, sessionId);

    this.logger.log(
      `[Payments] Card creada id=${id} - "${tenant.unidadNombre}" - ${tenant.propietarioNombre}`,
    );
  }
}
