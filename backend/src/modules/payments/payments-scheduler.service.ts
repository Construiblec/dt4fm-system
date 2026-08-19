import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentReminderService } from './payment-reminder.service';
import { OverdueNoticeService } from './overdue-notice.service';

/**
 * Scheduler que ejecuta la verificacion de pagos diariamente.
 * La logica de si corresponde generar o no segun DiaEmision
 * la resuelve PaymentsService consultando ConfigExpensa en openMAINT.
 *
 * Habilitacion: PAYMENTS_SCHEDULER_ENABLED=true en el .env
 * Hora: PAYMENTS_SCHEDULER_HOUR / PAYMENTS_SCHEDULER_MINUTE (defecto 08:00)
 */
@Injectable()
export class PaymentsSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsSchedulerService.name);
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly reminderService: PaymentReminderService,
    private readonly overdueNoticeService: OverdueNoticeService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled =
      this.configService.get<string>('PAYMENTS_SCHEDULER_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(
        'Scheduler de pagos DESHABILITADO. Activa con PAYMENTS_SCHEDULER_ENABLED=true',
      );
      return;
    }

    this.scheduleNextRun();
    this.logger.log('Scheduler de pagos diario iniciado');
  }

  onModuleDestroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private scheduleNextRun(): void {
    const ms = this.msUntilNextRun();
    const hours = Math.round(ms / 3_600_000);
    this.logger.log(`Proxima verificacion de pagos en ~${hours} horas`);

    this.timeoutHandle = setTimeout(async () => {
      await this.runGeneration();
      this.scheduleNextRun();
    }, ms);
  }

  private msUntilNextRun(): number {
    const hour = Number(
      this.configService.get<string>('PAYMENTS_SCHEDULER_HOUR') ?? '8',
    );
    const minute = Number(
      this.configService.get<string>('PAYMENTS_SCHEDULER_MINUTE') ?? '0',
    );

    const now = new Date();

    // Apuntar a la hora configurada de hoy
    const todayRun = new Date(now);
    todayRun.setHours(hour, minute, 0, 0);

    // Si aun no paso la hora de hoy, correr hoy
    if (todayRun > now) {
      return todayRun.getTime() - now.getTime();
    }

    // Si ya paso, correr manana a la misma hora
    const tomorrowRun = new Date(todayRun);
    tomorrowRun.setDate(tomorrowRun.getDate() + 1);

    return tomorrowRun.getTime() - now.getTime();
  }

  async runGeneration(): Promise<void> {
    const now = new Date();
    const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    this.logger.log(
      `Ejecutando verificacion diaria de pagos para periodo ${periodo}...`,
    );

    // 1) Generación de pagos (se activa solo en DiaEmision).
    try {
      const result =
        await this.paymentsService.generateMonthlyPayments(periodo);

      if (result.skippedReason) {
        this.logger.log(
          `Verificacion de generacion finalizada: ${result.skippedReason}`,
        );
      } else {
        this.logger.log(
          `Generacion completada -> ` +
            `total:${result.total} ` +
            `creados:${result.created} ` +
            `omitidos:${result.skipped} ` +
            `fallidos:${result.failed}`,
        );

        if (result.errors.length > 0) {
          this.logger.warn(`Errores encontrados:\n${result.errors.join('\n')}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Verificacion de pagos fallida: ${(error as Error).message}`,
      );
    }

    // 2) Recordatorios de vencimiento (se activan solo un día antes del
    //    DiaVencimiento). Independiente de la generación: un fallo aquí no
    //    afecta lo anterior y viceversa.
    try {
      const reminder = await this.reminderService.sendDueReminders(periodo);

      if (reminder.skippedReason) {
        this.logger.log(
          `Verificacion de recordatorios finalizada: ${reminder.skippedReason}`,
        );
      } else {
        this.logger.log(
          `Recordatorios completados -> ` +
            `propietariosConPendientes:${reminder.propietariosConPendientes} ` +
            `notificados:${reminder.propietariosNotificados} ` +
            `correos[enviados:${reminder.emailsSent} fallidos:${reminder.emailsFailed} sinEmail:${reminder.emailsSkipped}]`,
        );

        if (reminder.errors.length > 0) {
          this.logger.warn(
            `Errores en recordatorios:\n${reminder.errors.join('\n')}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Verificacion de recordatorios fallida: ${(error as Error).message}`,
      );
    }

    // 3) Avisos de valores vencidos (se activan solo los días 1 y 15).
    //    Independiente de los pasos anteriores, igual que ellos entre sí.
    try {
      const overdue = await this.overdueNoticeService.sendOverdueNotices();

      if (overdue.skippedReason) {
        this.logger.log(
          `Verificacion de avisos de mora finalizada: ${overdue.skippedReason}`,
        );
      } else {
        this.logger.log(
          `Avisos de mora completados -> ` +
            `propietariosConVencidos:${overdue.propietariosConVencidos} ` +
            `notificados:${overdue.propietariosNotificados} ` +
            `correos[enviados:${overdue.emailsSent} fallidos:${overdue.emailsFailed} sinEmail:${overdue.emailsSkipped}]`,
        );

        if (overdue.errors.length > 0) {
          this.logger.warn(
            `Errores en avisos de mora:\n${overdue.errors.join('\n')}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Verificacion de avisos de mora fallida: ${(error as Error).message}`,
      );
    }
  }
}
