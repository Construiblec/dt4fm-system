import { Module } from '@nestjs/common';
import { CleaningTasksModule } from '../cleaning-tasks/cleaning-tasks.module';
import { IntegrationsApiModule } from '../integrations-api/integrations-api.module';
import { CleaningsApiController } from './cleanings-api.controller';
import { CleaningsCacheService } from './cleanings-cache.service';
import { CleaningsPlanningController } from './cleanings-planning.controller';
import { CleaningsWriteController } from './cleanings-write.controller';

@Module({
  imports: [CleaningTasksModule, IntegrationsApiModule],
  controllers: [
    CleaningsApiController,
    CleaningsPlanningController,
    CleaningsWriteController,
  ],
  providers: [CleaningsCacheService],
})
export class CleaningsApiModule {}
