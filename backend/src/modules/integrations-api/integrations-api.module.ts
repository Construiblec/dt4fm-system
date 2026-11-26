import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import {
  LEGACY_READ_KEYS,
  LEGACY_WRITE_KEYS,
  READ_KEYS,
  WRITE_KEYS,
} from './guards/integrations-api-key.guard';
import { readKeyList } from './utils/read-key-list.util';

/** Un único limitador para todas las familias: el contador de IP es común. */
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class IntegrationsApiModule implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  // Al arrancar, para que el aviso de variables obsoletas no espere a la primera petición.
  onModuleInit(): void {
    readKeyList(this.config, READ_KEYS, LEGACY_READ_KEYS);
    readKeyList(this.config, WRITE_KEYS, LEGACY_WRITE_KEYS);
  }
}
