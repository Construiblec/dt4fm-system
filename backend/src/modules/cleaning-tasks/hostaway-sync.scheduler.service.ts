import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { describeError } from '../../common/logging/describe-error.util';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { CleaningSyncService } from './cleaning-sync.service';

/** Barrido de limpiezas cada 15 min. Solo con HOSTAWAY_SCHEDULER_ENABLED=true. */
@Injectable()
export class HostawaySyncSchedulerService {
  private readonly logger = new Logger(HostawaySyncSchedulerService.name);

  constructor(
    private readonly cleaningSync: CleaningSyncService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('7,22,37,52 * * * *', { timeZone: BUSINESS_TIMEZONE })
  async run(): Promise<void> {
    if (
      this.configService.get<string>('HOSTAWAY_SCHEDULER_ENABLED') !== 'true'
    ) {
      return;
    }

    try {
      const r = await this.cleaningSync.reconcileWindow();
      const summary =
        `Sincronización de limpiezas ${r.dateFrom} → ${r.dateTo}: ` +
        `creadas=${r.created} actualizadas=${r.updated} canceladas=${r.cancelled} ` +
        `sin_cambios=${r.unchanged} omitidas=${r.skipped} fallidas=${r.failed}`;

      if (r.failed > 0) {
        this.logger.warn(summary);
      } else if (r.created + r.updated + r.cancelled > 0) {
        this.logger.log(summary);
      } else {
        this.logger.debug(summary);
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron sincronizar las limpiezas — ${describeError(error)}`,
      );
    }
  }
}
