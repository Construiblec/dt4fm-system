import { Injectable } from '@nestjs/common';
import { IntegrationsCacheService } from '../integrations-api/integrations-cache.service';

/** Token propio: cada familia tiene su caché, pero se vacían juntas al escribir. */
@Injectable()
export class CleaningsCacheService extends IntegrationsCacheService {}
