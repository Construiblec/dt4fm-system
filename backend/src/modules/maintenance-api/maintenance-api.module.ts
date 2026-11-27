import { Module } from '@nestjs/common';
import { IntegrationsApiModule } from '../integrations-api/integrations-api.module';
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import { MaintenanceSupervisionModule } from '../maintenance-supervision/maintenance-supervision.module';
import { CorrectivesApiController } from './correctives-api.controller';
import { CorrectivesWriteController } from './correctives-write.controller';
import { MaintenanceSupportController } from './maintenance-support.controller';
import { PreventivesApiController } from './preventives-api.controller';
import { PreventivesWriteController } from './preventives-write.controller';

@Module({
  imports: [MaintenanceSupervisionModule, IntegrationsApiModule],
  controllers: [
    CorrectivesApiController,
    CorrectivesWriteController,
    PreventivesApiController,
    PreventivesWriteController,
    MaintenanceSupportController,
  ],
  providers: [MaintenanceCacheService],
})
export class MaintenanceApiModule {}
