import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PasswordRecoveryController } from './password-recovery.controller';
import { PasswordRecoveryOpenmaintService } from './password-recovery.openmaint.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { RateLimiterService } from './rate-limiter.service';
import { ResetTokenService } from './reset-token.service';

@Module({
  imports: [OpenmaintModule, NotificationsModule],
  controllers: [PasswordRecoveryController],
  providers: [
    PasswordRecoveryService,
    PasswordRecoveryOpenmaintService,
    ResetTokenService,
    RateLimiterService,
  ],
})
export class PasswordRecoveryModule {}
