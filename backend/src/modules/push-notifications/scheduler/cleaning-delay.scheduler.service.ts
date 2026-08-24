import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PushDispatchService } from '../push-dispatch.service';
import { PushSchedulerGateway } from './push-scheduler.gateway';
import { BUSINESS_TIMEZONE } from './scheduler.constants';

@Injectable()
export class CleaningDelaySchedulerService {
  private readonly logger = new Logger(CleaningDelaySchedulerService.name);

  constructor(
    private readonly gateway: PushSchedulerGateway,
    private readonly dispatch: PushDispatchService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Cada 15 minutos, solo en horario laboral: fuera de él no hay nadie a quien
   * avisar y cada ejecución despierta el compute de la base.
   *
   * El barrido consulta openMAINT primero y solo toca Postgres cuando encuentra
   * una tarea atrasada, para no mantener la base despierta sin necesidad.
   */
  @Cron('*/15 6-20 * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    if (this.configService.get<string>('PUSH_SCHEDULER_ENABLED') !== 'true') {
      return;
    }

    const sessionId = await this.gateway.getServiceSessionId();
    if (!sessionId) return;

    const tasks = await this.gateway.findAssignedCleaningTasks(sessionId);
    const now = Date.now();
    let sent = 0;

    for (const task of tasks) {
      // Sin hora prevista no hay retraso que medir. Las tareas generadas desde
      // Hostaway nacen sin PlannedStartTime, así que quedan fuera.
      if (!task.PlannedStartTime || task.ActualStartTime) continue;
      if (!task.Employee) continue;

      const plannedStart = new Date(task.PlannedStartTime).getTime();
      if (Number.isNaN(plannedStart) || plannedStart > now) continue;

      const eventKey = `cleaning:${task._id}:delayed`;
      if (!(await this.dispatch.claimDispatch(eventKey))) continue;

      const buildingName = task.Unit
        ? await this.gateway.findUnitBuilding(task.Unit, sessionId)
        : null;

      await this.dispatch.notifyCleaningDelayed({
        id: task._id,
        cleaningEmployeeId: task.Employee,
        unitName: task._Unit_description,
        buildingName,
      });

      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Avisos de limpieza atrasada enviados: ${sent}`);
    }
  }
}
