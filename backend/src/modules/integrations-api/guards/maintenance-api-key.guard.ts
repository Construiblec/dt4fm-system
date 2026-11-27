import { Injectable } from '@nestjs/common';
import { IntegrationsApiKeyGuard } from './integrations-api-key.guard';

/** Lectura de mantenimiento: acepta claves de lectura y de escritura. */
@Injectable()
export class MaintenanceApiKeyGuard extends IntegrationsApiKeyGuard {
  protected readonly family = 'maintenance' as const;
  protected readonly writes: boolean = false;
}
