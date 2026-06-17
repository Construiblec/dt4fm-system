import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsSchedulerService } from './payments-scheduler.service';

@Module({
  imports: [OpenmaintModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsSchedulerService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
