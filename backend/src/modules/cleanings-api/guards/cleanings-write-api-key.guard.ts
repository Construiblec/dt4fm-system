import { Injectable } from '@nestjs/common';
import { CleaningsApiKeyGuard } from './cleanings-api-key.guard';

/** Solo claves de CLEANINGS_WRITE_API_KEYS. */
@Injectable()
export class CleaningsWriteApiKeyGuard extends CleaningsApiKeyGuard {
  protected override readonly writes: boolean = true;
}
