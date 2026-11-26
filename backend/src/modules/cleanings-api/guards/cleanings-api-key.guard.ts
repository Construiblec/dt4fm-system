import { Injectable } from '@nestjs/common';
import { IntegrationsApiKeyGuard } from '../../integrations-api/guards/integrations-api-key.guard';

export { INTEGRATIONS_API_KEY_HEADER as CLEANINGS_API_KEY_HEADER } from '../../integrations-api/guards/integrations-api-key.guard';

/** Claves de INTEGRATIONS_READ_API_KEYS y, también para leer, las de escritura. */
@Injectable()
export class CleaningsApiKeyGuard extends IntegrationsApiKeyGuard {
  protected readonly family = 'cleanings' as const;
  protected readonly writes: boolean = false;
}
