import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { CleaningSupervisionsController } from './cleaning-supervisions.controller';
import { CleaningSupervisionsOpenmaintService } from './cleaning-supervisions.openmaint.service';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import { CleaningTasksController } from './cleaning-tasks.controller';
import { CleaningTasksService } from './cleaning-tasks.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import { HostawaySyncSchedulerService } from './hostaway-sync.scheduler.service';

/**
 * `CleaningSupervisionsService` no depende de `CleaningTasksService` (solo de
 * los gateways), así que `CleaningTasksService` puede usarlo al completar y
 * reabrir sin crear un ciclo.
 */
@Module({
  imports: [OpenmaintModule, HostawayModule, PushNotificationsModule],
  controllers: [CleaningTasksController, CleaningSupervisionsController],
  providers: [
    CleaningTasksService,
    CleaningTasksOpenmaintService,
    CleaningTasksSessionService,
    CleaningSupervisionsService,
    CleaningSupervisionsOpenmaintService,
    HostawaySyncSchedulerService,
  ],
})
export class CleaningTasksModule {}
