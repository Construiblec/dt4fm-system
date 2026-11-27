import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { ServiceAccountSessionModule } from '../../integrations/openmaint/service-account/service-account-session.module';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { CleaningNoticesService } from './cleaning-notices.service';
import { CleaningPlanningService } from './cleaning-planning.service';
import { CleaningReservationLockService } from './cleaning-reservation-lock.service';
import { CleaningSyncService } from './cleaning-sync.service';
import { CleaningSyncBaseline } from './entities/cleaning-sync-baseline.entity';
import { CleaningSyncCancellation } from './entities/cleaning-sync-cancellation.entity';
import { CleaningReadService } from './cleaning-read.service';
import { CleaningSupervisionsController } from './cleaning-supervisions.controller';
import { CleaningSupervisionsOpenmaintService } from './cleaning-supervisions.openmaint.service';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import { CleaningTasksController } from './cleaning-tasks.controller';
import { CleaningTasksService } from './cleaning-tasks.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import { HostawaySyncSchedulerService } from './hostaway-sync.scheduler.service';

/**
 * `CleaningSupervisionsService` no depende de `CleaningTasksService` (solo de
 * los gateways), así que `CleaningTasksService` puede usarlo al completar y
 * reabrir sin crear un ciclo.
 */
@Module({
  imports: [
    OpenmaintModule,
    ServiceAccountSessionModule,
    HostawayModule,
    PushNotificationsModule,
    TypeOrmModule.forFeature([CleaningSyncCancellation, CleaningSyncBaseline]),
  ],
  controllers: [CleaningTasksController, CleaningSupervisionsController],
  providers: [
    CleaningTasksService,
    CleaningTasksOpenmaintService,
    CleaningSupervisionsService,
    CleaningSupervisionsOpenmaintService,
    HostawaySyncSchedulerService,
    CleaningReadService,
    CleaningReservationLockService,
    CleaningNoticesService,
    CleaningPlanningService,
    CleaningSyncService,
  ],
  exports: [CleaningReadService, CleaningPlanningService, CleaningSyncService],
})
export class CleaningTasksModule {}
