import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ContificoModule } from '../../integrations/contifico/contifico.module';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingSchedulerService } from './billing-scheduler.service';

@Module({
  imports: [HttpModule, ContificoModule, OpenmaintModule, HostawayModule],
  controllers: [BillingController],
  providers: [BillingService, BillingSchedulerService],
  exports: [BillingService],
})
export class BillingModule {}
