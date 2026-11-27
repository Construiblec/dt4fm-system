import { Injectable } from '@nestjs/common';
import { IntegrationsCacheService } from './integrations-cache.service';

/** Token propio para la familia de mantenimiento. */
@Injectable()
export class MaintenanceCacheService extends IntegrationsCacheService {}
