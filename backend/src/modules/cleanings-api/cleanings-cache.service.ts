import { Injectable } from '@nestjs/common';
import { IntegrationsCacheService } from '../integrations-api/integrations-cache.service';

/** Token propio: cada familia tiene su caché. */
@Injectable()
export class CleaningsCacheService extends IntegrationsCacheService {}
