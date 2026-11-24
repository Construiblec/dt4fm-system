import { Module } from '@nestjs/common';
import { CleaningTasksModule } from '../cleaning-tasks/cleaning-tasks.module';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { CleaningsApiController } from './cleanings-api.controller';
import { CleaningsCacheService } from './cleanings-cache.service';

@Module({
  imports: [CleaningTasksModule],
  controllers: [CleaningsApiController],
  // Contadores propios en memoria: no se comparten con otros módulos.
  providers: [CleaningsCacheService, RateLimiterService],
})
export class CleaningsApiModule {}
