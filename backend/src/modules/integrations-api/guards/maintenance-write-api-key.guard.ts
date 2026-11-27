import { Injectable } from '@nestjs/common';
import { MaintenanceApiKeyGuard } from './maintenance-api-key.guard';

/** Solo claves de INTEGRATIONS_WRITE_API_KEYS. */
@Injectable()
export class MaintenanceWriteApiKeyGuard extends MaintenanceApiKeyGuard {
  protected override readonly writes: boolean = true;
}
