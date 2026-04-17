import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CleaningTasksService } from './cleaning-tasks.service';

/**
 * Scheduler que ejecuta la sincronización Hostaway → OpenMAINT
 * automáticamente a medianoche cada día.
 *
 * Habilitación: establecer HOSTAWAY_SCHEDULER_ENABLED=true en el .env
 * Hora de ejecución: 00:00 hora local del servidor (configurable con
 *   HOSTAWAY_SCHEDULER_HOUR / HOSTAWAY_SCHEDULER_MINUTE, defecto 0:00)
 */
@Injectable()
export class HostawaySyncSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(HostawaySyncSchedulerService.name);
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly cleaningTasksService: CleaningTasksService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled =
      this.configService.get<string>('HOSTAWAY_SCHEDULER_ENABLED') === 'true';

    if (!enabled) {
      this.logger.log(
        'Scheduler diario DESHABILITADO. Actívalo con HOSTAWAY_SCHEDULER_ENABLED=true',
      );
      return;
    }

    this.scheduleNextRun();
    this.logger.log('Scheduler diario Hostaway → OpenMAINT iniciado ✅');
  }

  onModuleDestroy() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  private scheduleNextRun(): void {
    const ms = this.msUntilNextRun();
    const minutes = Math.round(ms / 60_000);
    this.logger.log(`Próxima sincronización en ${minutes} minutos`);

    this.timeoutHandle = setTimeout(async () => {
      await this.runSync();
      this.scheduleNextRun(); // volver a programar para el día siguiente
    }, ms);
  }

  private msUntilNextRun(): number {
    const hour = Number(
      this.configService.get<string>('HOSTAWAY_SCHEDULER_HOUR') ?? '0',
    );
    const minute = Number(
      this.configService.get<string>('HOSTAWAY_SCHEDULER_MINUTE') ?? '0',
    );

    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);

    // Si la hora de hoy ya pasó, apuntar al día siguiente
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next.getTime() - now.getTime();
  }

  async runSync(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    this.logger.log(`Ejecutando sincronización diaria para ${today}...`);

    try {
      const results = await this.cleaningTasksService.syncFromHostaway(
        today,
        today,
      );
      this.logger.log(
        `Sincronización completada → ` +
          `creadas: ${results.created}, ` +
          `omitidas: ${results.skipped}, ` +
          `fallidas: ${results.failed}`,
      );
    } catch (error) {
      this.logger.error(`Sincronización fallida: ${(error as Error).message}`);
    }
  }
}
