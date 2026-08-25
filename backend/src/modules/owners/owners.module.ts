import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';
import { PaymentPaidNotifierService } from './payment-paid-notifier.service';

@Module({
  imports: [OpenmaintModule, AuthModule, NotificationsModule],
  controllers: [OwnersController],
  providers: [OwnersService, PaymentPaidNotifierService],
})
export class OwnersModule {}
