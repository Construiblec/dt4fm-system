import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';

/**
 * Scheduler que ejecuta la facturacion diaria automatica a las 23:50.
 *
 * Habilitacion: BILLING_SCHEDULER_ENABLED=true en el .env
 * Hora: BILLING_SCHEDULER_HOUR / BILLING_SCHEDULER_MINUTE (defecto 23:50)
 */
@Injectable()
export class BillingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSchedulerService.name);
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled =
      this.configService.get<string>('BILLING_SCHEDULER_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(
        'Scheduler de facturacion DESHABILITADO. Activa con BILLING_SCHEDULER_ENABLED=true',
      );
      return;
    }

    this.scheduleNextRun();
    this.logger.log('Scheduler de facturacion diaria iniciado');
  }

  onModuleDestroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private scheduleNextRun(): void {
    const ms = this.msUntilNextRun();
    const minutes = Math.round(ms / 60_000);
    this.logger.log(`Proxima facturacion en ${minutes} minutos`);

    this.timeoutHandle = setTimeout(async () => {
      await this.runBilling();
      this.scheduleNextRun();
    }, ms);
  }

  private msUntilNextRun(): number {
    const hour = Number(
      this.configService.get<string>('BILLING_SCHEDULER_HOUR') ?? '23',
    );
    const minute = Number(
      this.configService.get<string>('BILLING_SCHEDULER_MINUTE') ?? '50',
    );

    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime() - now.getTime();
  }

  async runBilling(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    this.logger.log(`Ejecutando facturacion diaria para ${today}...`);

    try {
      const result = await this.billingService.runDailyBilling(today);
      this.logger.log(
        `Facturacion completada -> ` +
          `total:${result.total} ` +
          `facturadas:${result.invoiced} ` +
          `omitidas:${result.skipped} ` +
          `fallidas:${result.failed}`,
      );

      if (result.errors.length > 0) {
        this.logger.warn(`Errores encontrados:\n${result.errors.join('\n')}`);
      }
    } catch (error) {
      this.logger.error(
        `Facturacion diaria fallida: ${(error as Error).message}`,
      );
    }
  }
}
