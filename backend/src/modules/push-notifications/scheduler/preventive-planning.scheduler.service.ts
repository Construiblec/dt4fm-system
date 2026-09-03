import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PushDispatchService } from '../push-dispatch.service';
import { PushSchedulerGateway } from './push-scheduler.gateway';
import { BUSINESS_TIMEZONE, daysUntil } from './scheduler.constants';

/**
 * Ventanas de aviso en días hasta el inicio previsto. Son rangos y no valores
 * exactos para sobrevivir a un día sin ejecutar (un deploy a la hora del cron);
 * que solo se avise una vez lo garantiza `notification_dispatch_log`.
 */
const HORIZONS = [
  { horizon: '30d' as const, min: 25, max: 30 },
  { horizon: '2d' as const, min: 0, max: 2 },
];

@Injectable()
export class PreventivePlanningSchedulerService {
  private readonly logger = new Logger(PreventivePlanningSchedulerService.name);

  constructor(
    private readonly gateway: PushSchedulerGateway,
    private readonly dispatch: PushDispatchService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 8 * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    if (this.configService.get<string>('PUSH_SCHEDULER_ENABLED') !== 'true') {
      return;
    }

    const sessionId = await this.gateway.getServiceSessionId();
    if (!sessionId) return;

    const cards = await this.gateway.findPlanningPreventives(sessionId);
    let sent = 0;

    for (const card of cards) {
      const days = daysUntil(card.ExpExecStartDate);
      if (days === null) continue;

      const match = HORIZONS.find(
        (window) => days >= window.min && days <= window.max,
      );
      if (!match) continue;

      const eventKey = `preventive:${card._id}:planning-${match.horizon}`;
      if (!(await this.dispatch.claimDispatch(eventKey))) continue;

      await this.dispatch.notifyPreventivePlanning({
        id: card._id,
        planName:
          card._PrevMaintConfig_description?.trim() ||
          card.Number?.trim() ||
          'un mantenimiento preventivo',
        horizon: match.horizon,
      });

      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(
        `Avisos de planificación enviados: ${sent} de ${cards.length} preventivos revisados`,
      );
    }
  }
}
