import { Module } from '@nestjs/common';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';

/** Un único limitador para todas las familias: el contador de IP es común. */
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class IntegrationsApiModule {}
