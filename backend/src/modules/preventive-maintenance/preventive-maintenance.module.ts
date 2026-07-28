import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { PreventiveMaintenanceController } from './preventive-maintenance.controller';
import { PreventiveMaintenanceOpenmaintService } from './preventive-maintenance.openmaint.service';
import { PreventiveMaintenanceService } from './preventive-maintenance.service';

@Module({
  imports: [OpenmaintModule],
  controllers: [PreventiveMaintenanceController],
  providers: [
    PreventiveMaintenanceService,
    PreventiveMaintenanceOpenmaintService,
  ],
})
export class PreventiveMaintenanceModule {}
