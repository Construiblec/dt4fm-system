import { Module } from '@nestjs/common';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { CleaningTasksController } from './cleaning-tasks.controller';
import { CleaningTasksService } from './cleaning-tasks.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';
import { HostawaySyncSchedulerService } from './hostaway-sync.scheduler.service';

@Module({
  imports: [OpenmaintModule, HostawayModule],
  controllers: [CleaningTasksController],
  providers: [
    CleaningTasksService,
    CleaningTasksOpenmaintService,
    CleaningTasksSessionService,
    HostawaySyncSchedulerService,
  ],
})
export class CleaningTasksModule {}
