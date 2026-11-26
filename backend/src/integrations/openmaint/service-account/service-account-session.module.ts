import { Module } from '@nestjs/common';
import { CleaningTasksSessionService } from '../../../modules/cleaning-tasks/cleaning-tasks.session.service';
import { OpenmaintModule } from '../openmaint.module';

/** Única instancia de la sesión de servicio: dos instancias son dos logins y riesgo de bloqueo. */
@Module({
  imports: [OpenmaintModule],
  providers: [CleaningTasksSessionService],
  exports: [CleaningTasksSessionService],
})
export class ServiceAccountSessionModule {}
