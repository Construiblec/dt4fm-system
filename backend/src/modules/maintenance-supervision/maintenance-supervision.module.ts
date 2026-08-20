import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { PreventiveMaintenanceOpenmaintService } from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import { CorrectiveMaintOpenmaintService } from './corrective-maint.openmaint.service';
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
  imports: [OpenmaintModule],
  controllers: [MaintenanceSupervisionController],
  providers: [
    MaintenanceSupervisionService,
    CorrectiveMaintOpenmaintService,
    PreventiveMaintenanceOpenmaintService,
  ],
})
export class MaintenanceSupervisionModule {}
