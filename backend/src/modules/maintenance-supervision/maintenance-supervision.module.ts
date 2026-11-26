import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { ServiceAccountSessionModule } from '../../integrations/openmaint/service-account/service-account-session.module';
import { PreventiveMaintenanceOpenmaintService } from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import { EquipmentOpenmaintService } from '../corrective-maintenance/equipment.openmaint.service';
import { PreventiveMaintenanceModule } from '../preventive-maintenance/preventive-maintenance.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { CorrectiveMaintOpenmaintService } from './corrective-maint.openmaint.service';
import { CorrectiveFlow } from './flows/corrective-flow';
import { PreventiveFlow } from './flows/preventive-flow';
import { MaintenanceReadService } from './maintenance-read.service';
import { MaintenanceSupervisionController } from './maintenance-supervision.controller';
import { MaintenanceSupervisionService } from './maintenance-supervision.service';

/**
 * Panel del rol `SupervisorMantenimiento`.
 *
 * Reutiliza el gateway preventivo tal cual (solo se le añadió `findAll`) y
 * aporta uno nuevo para `CorrectiveMaint`, que hasta ahora solo sabía crear y
 * cerrar desde el módulo de incidentes.
 */
@Module({
  imports: [
    OpenmaintModule,
    ServiceAccountSessionModule,
    PushNotificationsModule,
    PreventiveMaintenanceModule,
  ],
  controllers: [MaintenanceSupervisionController],
  providers: [
    MaintenanceSupervisionService,
    CorrectiveMaintOpenmaintService,
    PreventiveMaintenanceOpenmaintService,
    EquipmentOpenmaintService,
    CorrectiveFlow,
    PreventiveFlow,
    MaintenanceReadService,
  ],
  exports: [MaintenanceReadService],
})
export class MaintenanceSupervisionModule {}
