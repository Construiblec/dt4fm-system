import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { CorrectiveMaintOpenmaintService } from '../maintenance-supervision/corrective-maint.openmaint.service';
import { PreventiveMaintenanceOpenmaintService } from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import { CorrectiveDocumentsService } from './corrective-documents.service';
import { CorrectiveMaintenanceController } from './corrective-maintenance.controller';
import { EquipmentOpenmaintService } from './equipment.openmaint.service';

/** Documentación del correctivo, compartida por el técnico y el supervisor. */
@Module({
  imports: [OpenmaintModule],
  controllers: [CorrectiveMaintenanceController],
  providers: [
    CorrectiveDocumentsService,
    CorrectiveMaintOpenmaintService,
    PreventiveMaintenanceOpenmaintService,
    EquipmentOpenmaintService,
  ],
  exports: [EquipmentOpenmaintService],
})
export class CorrectiveMaintenanceModule {}
