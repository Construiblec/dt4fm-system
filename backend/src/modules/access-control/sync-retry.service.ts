import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';

const DEFAULT_MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;

/**
 * Reintenta lo que quedó sin sincronizar: un edificio incomunicado, un corte a
 * mitad de escritura, o un reinicio de Render entre el insert y la llamada.
 */
@Injectable()
export class SyncRetryService {
  private readonly logger = new Logger(SyncRetryService.name);

  constructor(
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly credentialService: CredentialService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/10 * * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    // Dentro del método: los decoradores @Cron se evalúan al importar, antes de
    // que Nest instancie nada.
    if (this.configService.get<string>('ACCESS_SCHEDULER_ENABLED') !== 'true') {
      return;
    }

    const pending = await this.credentials.find({
      where: { syncState: Not('synced') },
      order: { updatedAt: 'ASC' },
      take: BATCH_SIZE,
    });

    const maxAttempts = this.maxAttempts();
    let retried = 0;

    for (const credential of pending) {
      if (credential.syncAttempts >= maxAttempts) {
        await this.giveUp(credential);
        continue;
      }

      await this.credentialService.sync(credential);
      retried += 1;
    }

    if (retried > 0) {
      this.logger.log(`Reintentadas ${retried} credenciales sin sincronizar`);
    }
  }

  /** `failed` pide atención humana: existe en el sistema pero no en la puerta. */
  private async giveUp(credential: AccessCredential): Promise<void> {
    if (credential.syncState === 'failed') {
      return;
    }

    credential.syncState = 'failed';
    await this.credentials.save(credential);
    this.logger.error(
      `Credencial ${credential.id} agotó los reintentos de sincronización`,
    );
  }

  private maxAttempts(): number {
    const raw = Number(
      this.configService.get<string>('ACCESS_SYNC_MAX_ATTEMPTS'),
    );

    return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_ATTEMPTS;
  }
}
