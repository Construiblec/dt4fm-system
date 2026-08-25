import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { Notification } from './entities/notification.entity';
import { NotificationDispatchLog } from './entities/notification-dispatch-log.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushDispatchService } from './push-dispatch.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushSenderService } from './push-sender.service';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { PushSubscriptionService } from './push-subscription.service';
import { CleaningDelaySchedulerService } from './scheduler/cleaning-delay.scheduler.service';
import { PreventivePlanningSchedulerService } from './scheduler/preventive-planning.scheduler.service';
import { PushSchedulerGateway } from './scheduler/push-scheduler.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscription,
      Notification,
      NotificationDispatchLog,
    ]),
    OpenmaintModule,
  ],
  controllers: [PushNotificationsController],
  providers: [
    PushSubscriptionRepository,
    PushSenderService,
    PushSubscriptionService,
    PushDispatchService,
    PushSchedulerGateway,
    PreventivePlanningSchedulerService,
    CleaningDelaySchedulerService,
  ],
  // Lo que consumen los módulos de dominio para notificar.
  exports: [PushDispatchService],
})
export class PushNotificationsModule {}
