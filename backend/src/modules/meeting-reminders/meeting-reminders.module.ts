import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingRemindersController } from './meeting-reminders.controller';
import { MeetingRemindersService } from './meeting-reminders.service';
import { MeetingRemindersSchedulerService } from './meeting-reminders.scheduler.service';

/**
 * Recordatorio automático de reuniones.
 *
 * - OpenmaintModule  → OpenmaintClient + OpenmaintAuthService (consulta cards).
 * - NotificationsModule → MailerService (motor de envío con el provider activo).
 */
@Module({
  imports: [OpenmaintModule, NotificationsModule],
  controllers: [MeetingRemindersController],
  providers: [MeetingRemindersService, MeetingRemindersSchedulerService],
})
export class MeetingRemindersModule {}
