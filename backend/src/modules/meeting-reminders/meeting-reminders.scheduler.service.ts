import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeetingRemindersService } from './meeting-reminders.service';

/**
 * Scheduler que ejecuta el recordatorio de reuniones diariamente.
 * La lógica de qué reuniones notificar (ventana de N días) y a quién
 * la resuelve MeetingRemindersService consultando openMAINT.
 *
 * Habilitación: MEETING_REMINDER_SCHEDULER_ENABLED=true en el .env
 * Hora: MEETING_REMINDER_SCHEDULER_HOUR / MEETING_REMINDER_SCHEDULER_MINUTE
 *       (defecto 08:00)
 */
@Injectable()
export class MeetingRemindersSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MeetingRemindersSchedulerService.name);
  private timeoutHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly meetingRemindersService: MeetingRemindersService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const enabled =
      this.configService.get<string>('MEETING_REMINDER_SCHEDULER_ENABLED') ===
      'true';

    if (!enabled) {
      this.logger.log(
        'Scheduler de recordatorios de reuniones DESHABILITADO. ' +
          'Activa con MEETING_REMINDER_SCHEDULER_ENABLED=true',
      );
      return;
    }

    this.scheduleNextRun();
    this.logger.log('Scheduler de recordatorios de reuniones diario iniciado');
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
    this.logger.log(`Próximo recordatorio de reuniones en ~${hours} horas`);

    this.timeoutHandle = setTimeout(async () => {
      await this.runReminders();
      this.scheduleNextRun();
    }, ms);
  }

  private msUntilNextRun(): number {
    const hour = Number(
      this.configService.get<string>('MEETING_REMINDER_SCHEDULER_HOUR') ?? '8',
    );
    const minute = Number(
      this.configService.get<string>('MEETING_REMINDER_SCHEDULER_MINUTE') ??
        '0',
    );

    const now = new Date();

    const todayRun = new Date(now);
    todayRun.setHours(hour, minute, 0, 0);

    if (todayRun > now) {
      return todayRun.getTime() - now.getTime();
    }

    const tomorrowRun = new Date(todayRun);
    tomorrowRun.setDate(tomorrowRun.getDate() + 1);

    return tomorrowRun.getTime() - now.getTime();
  }

  async runReminders(): Promise<void> {
    this.logger.log('Ejecutando recordatorio diario de reuniones...');

    try {
      const summary = await this.meetingRemindersService.runReminderJob();

      const totalSent = summary.details.reduce((acc, d) => acc + d.sent, 0);
      const totalFailed = summary.details.reduce((acc, d) => acc + d.failed, 0);

      this.logger.log(
        `Recordatorio finalizado -> ` +
          `reuniones:${summary.meetingsTotal} ` +
          `coincidentes:${summary.meetingsMatched} ` +
          `enviados:${totalSent} ` +
          `fallidos:${totalFailed}`,
      );
    } catch (error) {
      this.logger.error(
        `Recordatorio de reuniones fallido: ${(error as Error).message}`,
      );
    }
  }
}
