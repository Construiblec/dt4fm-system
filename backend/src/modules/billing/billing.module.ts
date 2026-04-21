import { Module } from '@nestjs/common';
import { ContificoModule } from '../../integrations/contifico/contifico.module';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [ContificoModule, OpenmaintModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
