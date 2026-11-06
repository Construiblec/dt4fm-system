import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import {
  DIRECT_CHANNEL_NAMES,
  isDirectReservation,
} from '../guest-link/delivery/routed-link.channel';
import { BUSINESS_TIMEZONE } from '../push-notifications/scheduler/scheduler.constants';
import { pickGuestCredential } from './credential-priority';
import { CredentialService, LIVE_STATUSES } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestPinNotice } from './entities/guest-pin-notice.entity';
import { GuestStay } from './entities/guest-stay.entity';

export const HOSTAWAY_MESSAGE_CHANNEL = 'hostaway-message';
/** Solo pruebas: manda el mensaje a `GUEST_PIN_NOTICE_WEBHOOK_URL` en vez de al huésped. */
export const WEBHOOK_CHANNEL = 'webhook';

const WEBHOOK_TIMEOUT_MS = 10_000;

const BATCH_SIZE = 50;
const DEFAULT_RETRY_COOLDOWN_MINUTES = 30;

export interface PinNoticeResult {
  outcome: 'sent' | 'failed' | 'skipped';
  /** Por qué no se envió, cuando `outcome` es `skipped` o `failed`. */
  reason?: string;
  channel?: string;
  target?: string;
}

/** Lo que ve el CAV del aviso. Nunca lleva el PIN. */
export interface PinNoticeView {
  status: 'sent' | 'failed' | 'pending' | 'not_applicable';
  at: string | null;
  error: string | null;
}

/** Texto del aviso, bilingüe. Sin fechas, para que un cambio de fechas no obligue a reenviarlo. */
export function buildGuestPinMessage(guestName: string, pin: string): string {
  const nombre = guestName.trim() || 'Huésped';

  return [
    `Hola ${nombre}: tu código de acceso al edificio es ${pin}. Funciona desde tu check-in hasta tu salida; digítalo en el teclado de la entrada.`,
    '',
    `Hi ${nombre}: your building access code is ${pin}. It works from check-in until check-out; enter it on the keypad at the entrance.`,
  ].join('\n');
}

/** Canal por el que se avisa a esta estancia, o `null` si a la reserva no se le envía nada. */
export function pinNoticeChannelFor(
  stay: Pick<GuestStay, 'channelName'>,
  configured: string = HOSTAWAY_MESSAGE_CHANNEL,
): string | null {
  // Reservas directas: sin envío por ahora; si se habilitan, aquí va la rama del correo.
  return isDirectReservation(stay.channelName) ? null : configured;
}

/**
 * Avisa al huésped de su PIN por la conversación de Hostaway (o, en pruebas, a un
 * webhook), solo cuando la credencial ya está en la puerta: un `pin_conflict` puede cambiar el PIN antes.
 */
@Injectable()
export class GuestPinNoticeService {
  private readonly logger = new Logger(GuestPinNoticeService.name);

  constructor(
    @InjectRepository(GuestPinNotice)
    private readonly notices: Repository<GuestPinNotice>,
    @InjectRepository(GuestStay)
    private readonly stays: Repository<GuestStay>,
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly credentialService: CredentialService,
    private readonly hostaway: HostawayService,
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /** `GUEST_PIN_NOTICE_CHANNEL=webhook` solo para pruebas; cualquier otro valor es Hostaway. */
  private configuredChannel(): string {
    return (
      this.configService.get<string>('GUEST_PIN_NOTICE_CHANNEL') ?? ''
    ).toLowerCase() === WEBHOOK_CHANNEL
      ? WEBHOOK_CHANNEL
      : HOSTAWAY_MESSAGE_CHANNEL;
  }

  isEnabled(): boolean {
    return (
      this.configService.get<string>('GUEST_PIN_NOTICE_ENABLED') === 'true'
    );
  }

  /** Nunca lanza: un canal caído no puede romper a quien llama. */
  async notify(
    stayId: string,
    options: { force?: boolean } = {},
  ): Promise<PinNoticeResult> {
    try {
      return await this.tryNotify(stayId, options.force ?? false);
    } catch (error) {
      this.logger.error(
        `Aviso de PIN de la estancia ${stayId} fallido: ${this.describe(error)}`,
      );
      return { outcome: 'failed', reason: this.describe(error) };
    }
  }

  /** Recoge el empuje diferido del webhook, las rotaciones por `pin_conflict` y los reintentos. */
  @Cron('*/10 * * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    if (
      this.configService.get<string>('ACCESS_SCHEDULER_ENABLED') !== 'true' ||
      !this.isEnabled()
    ) {
      return;
    }

    const stayIds = await this.pendingStayIds();
    let sent = 0;

    for (const stayId of stayIds) {
      if ((await this.notify(stayId)).outcome === 'sent') sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Avisos de PIN enviados: ${sent}`);
    }
  }

  /** Estado del aviso por estancia, con una sola consulta. */
  async statusFor(
    items: { stay: GuestStay; credential: AccessCredential }[],
  ): Promise<Map<string, PinNoticeView>> {
    const views = new Map<string, PinNoticeView>();
    const credentialIds = items.map(({ credential }) => credential.id);
    const rows = credentialIds.length
      ? await this.notices.find({
          where: { credentialId: In(credentialIds) },
          order: { createdAt: 'DESC' },
        })
      : [];

    for (const { stay, credential } of items) {
      if (
        !this.isEnabled() ||
        !pinNoticeChannelFor(stay, this.configuredChannel())
      ) {
        views.set(stay.id, { status: 'not_applicable', at: null, error: null });
        continue;
      }

      // Solo cuentan los intentos con el PIN vigente.
      const own = rows.filter(
        (row) =>
          row.credentialId === credential.id &&
          row.pinFingerprint === credential.pinFingerprint,
      );
      const decisive = own.find((row) => row.status !== 'failed');
      const last = own[0];

      if (decisive?.status === 'sent') {
        views.set(stay.id, {
          status: 'sent',
          at: decisive.createdAt.toISOString(),
          error: null,
        });
      } else if (decisive?.status === 'skipped') {
        views.set(stay.id, {
          status: 'not_applicable',
          at: null,
          error: decisive.error,
        });
      } else if (last) {
        views.set(stay.id, {
          status: 'failed',
          at: last.createdAt.toISOString(),
          error: last.error,
        });
      } else {
        views.set(stay.id, { status: 'pending', at: null, error: null });
      }
    }

    return views;
  }

  private async tryNotify(
    stayId: string,
    force: boolean,
  ): Promise<PinNoticeResult> {
    if (!this.isEnabled()) {
      return { outcome: 'skipped', reason: 'disabled' };
    }

    const stay = await this.stays.findOne({ where: { id: stayId } });

    if (!stay || !['pending', 'active'].includes(stay.status)) {
      return { outcome: 'skipped', reason: 'stay_not_live' };
    }

    const credential = pickGuestCredential(
      await this.credentialService.findLiveForGuest(stay.hostawayReservationId),
    );

    if (!credential) {
      return { outcome: 'skipped', reason: 'no_credential' };
    }

    if (credential.syncState !== 'synced') {
      return { outcome: 'skipped', reason: 'not_synced' };
    }

    const channel = pinNoticeChannelFor(stay, this.configuredChannel());

    if (!channel) {
      return { outcome: 'skipped', reason: 'direct_reservation' };
    }

    if (!force) {
      if (await this.alreadyHandled(credential)) {
        return { outcome: 'skipped', reason: 'already_sent' };
      }

      if (await this.recentlyFailed(credential)) {
        return { outcome: 'skipped', reason: 'retry_cooldown' };
      }
    }

    return this.send(stay, credential, channel);
  }

  private async send(
    stay: GuestStay,
    credential: AccessCredential,
    channel: string,
  ): Promise<PinNoticeResult> {
    const reservationId = stay.hostawayReservationId;
    let target = '';
    let httpStatus: number | null = null;
    let error: string | null = null;

    try {
      const message = buildGuestPinMessage(
        stay.guestName,
        this.credentialService.revealPin(credential),
      );

      if (channel === WEBHOOK_CHANNEL) {
        target = await this.postToWebhook(stay, message);
      } else {
        const conversation =
          await this.hostaway.findConversationByReservation(reservationId);

        if (!conversation) {
          error = 'conversation_not_found';
        } else {
          target = `conversation:${conversation.id}`;
          await this.hostaway.sendConversationMessage(
            conversation.id,
            message,
            'channel',
          );
        }
      }
    } catch (err) {
      httpStatus =
        err instanceof HttpException
          ? err.getStatus()
          : ((err as AxiosError).response?.status ?? null);
      error = this.describe(err);
    }

    await this.notices.save(
      this.notices.create({
        credentialId: credential.id,
        guestStayId: stay.id,
        pinFingerprint: credential.pinFingerprint,
        channel,
        target,
        status: error ? 'failed' : 'sent',
        httpStatus,
        error,
      }),
    );

    if (error) {
      this.logger.warn(
        `PIN de la estancia ${stay.id} NO avisado (reserva ${reservationId}): ${error}`,
      );
      return { outcome: 'failed', reason: error, channel, target };
    }

    this.logger.log(`PIN de la estancia ${stay.id} avisado por ${target}`);

    return { outcome: 'sent', channel, target };
  }

  /** Devuelve el destino; lanza si la URL falta o el receptor falla. */
  private async postToWebhook(
    stay: GuestStay,
    message: string,
  ): Promise<string> {
    const url = this.configService
      .get<string>('GUEST_PIN_NOTICE_WEBHOOK_URL')
      ?.trim();

    if (!url) {
      throw new Error('GUEST_PIN_NOTICE_WEBHOOK_URL no está configurada');
    }

    await firstValueFrom(
      this.http.post(
        url,
        {
          event: 'guest-pin.notice',
          sentAt: new Date().toISOString(),
          stayId: stay.id,
          reservationId: stay.hostawayReservationId,
          guestName: stay.guestName,
          channelName: stay.channelName,
          message,
        },
        { timeout: WEBHOOK_TIMEOUT_MS },
      ),
    );

    return url;
  }

  /** `skipped` cuenta como atendido: son las credenciales anteriores al despliegue. */
  private alreadyHandled(credential: AccessCredential): Promise<boolean> {
    return this.notices.exists({
      where: {
        credentialId: credential.id,
        pinFingerprint: credential.pinFingerprint,
        status: In(['sent', 'skipped']),
      },
    });
  }

  private async recentlyFailed(credential: AccessCredential): Promise<boolean> {
    const cooldownMs = this.retryCooldownMinutes() * 60_000;

    if (cooldownMs <= 0) return false;

    const last = await this.notices.findOne({
      where: {
        credentialId: credential.id,
        pinFingerprint: credential.pinFingerprint,
      },
      order: { createdAt: 'DESC' },
    });

    return (
      last !== null &&
      last.status === 'failed' &&
      Date.now() - last.createdAt.getTime() < cooldownMs
    );
  }

  /** Estancias de canal con credencial en la puerta y sin aviso para su PIN vigente. */
  private async pendingStayIds(): Promise<string[]> {
    const rows = await this.credentials
      .createQueryBuilder('c')
      .innerJoin(GuestStay, 's', 's.id = c.guest_stay_id')
      .select('c.guest_stay_id', 'stayId')
      .where('c.subject_type = :guest', { guest: 'guest' })
      .andWhere('c.status IN (:...live)', { live: LIVE_STATUSES })
      .andWhere('c.sync_state = :synced', { synced: 'synced' })
      .andWhere('s.status IN (:...stayLive)', {
        stayLive: ['pending', 'active'],
      })
      .andWhere(
        `LOWER(TRIM(COALESCE(s.channel_name, ''))) NOT IN (:...direct)`,
        { direct: ['', ...DIRECT_CHANNEL_NAMES] },
      )
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM guest_pin_notice n
          WHERE n.credential_id = c.id
            AND n.pin_fingerprint = c.pin_fingerprint
            AND n.status IN ('sent', 'skipped'))`,
      )
      .orderBy('c.updatedAt', 'ASC')
      .limit(BATCH_SIZE)
      .getRawMany<{ stayId: string }>();

    return [...new Set(rows.map((row) => row.stayId))];
  }

  private retryCooldownMinutes(): number {
    const raw = Number(
      this.configService.get<string>('GUEST_PIN_NOTICE_RETRY_COOLDOWN_MINUTES'),
    );

    return Number.isFinite(raw) && raw >= 0
      ? raw
      : DEFAULT_RETRY_COOLDOWN_MINUTES;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
