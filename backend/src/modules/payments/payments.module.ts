import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSchedulerService } from './payments-scheduler.service';
import { PaymentReminderService } from './payment-reminder.service';
import { OverdueNoticeService } from './overdue-notice.service';
import { PaymentsOpenmaintRepository } from './payments-openmaint.repository';

@Module({
  imports: [OpenmaintModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsOpenmaintRepository,
    PaymentsService,
    PaymentReminderService,
    OverdueNoticeService,
    PaymentsSchedulerService,
  ],
  exports: [PaymentsService, PaymentReminderService, OverdueNoticeService],
})
export class PaymentsModule {}
