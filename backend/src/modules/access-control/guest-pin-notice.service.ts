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
import {
  GuestPinNotice,
  GuestPinNoticeStatus,
} from './entities/guest-pin-notice.entity';
import { GuestStay } from './entities/guest-stay.entity';

/** El PIN escrito en el `doorCode` de la reserva. */
export const DOOR_CODE_CHANNEL = 'hostaway-door-code';
/** Mensaje al chat de Hostaway; solo cuando el CAV renueva el PIN. */
export const RENEWAL_MESSAGE_CHANNEL = 'hostaway-message';
/** Solo pruebas: `GUEST_PIN_NOTICE_CHANNEL=webhook` manda todo a `GUEST_PIN_NOTICE_WEBHOOK_URL`. */
export const WEBHOOK_TRANSPORT = 'webhook';

export const DOOR_CODE_INSTRUCTION =
  'Digítalo en el teclado de la entrada del edificio. / Enter it on the keypad at the building entrance.';

const WEBHOOK_TIMEOUT_MS = 10_000;

const BATCH_SIZE = 50;
const DEFAULT_RETRY_COOLDOWN_MINUTES = 30;
const LIVE_STAY_STATUSES = ['pending', 'active'];

export interface PinNoticeResult {
  outcome: 'sent' | 'failed' | 'skipped';
  /** Por qué no se escribió, cuando `outcome` es `skipped` o `failed`. */
  reason?: string;
  channel?: string;
  target?: string;
  /** Resultado del mensaje de renovación, si había uno pendiente. */
  renewal?: PinNoticeResult;
}

/** Lo que ve el CAV del `doorCode`. Nunca lleva el PIN. */
export interface PinNoticeView {
  status: 'sent' | 'failed' | 'pending' | 'not_applicable';
  at: string | null;
  error: string | null;
}

/** Texto del mensaje de renovación, bilingüe y sin fechas. */
export function buildPinRenewedMessage(guestName: string, pin: string): string {
  const nombre = guestName.trim() || 'Huésped';

  return [
    `Hola ${nombre}: tu código de acceso al edificio ha cambiado. El nuevo código es ${pin}; el anterior ya no funciona. Digítalo en el teclado de la entrada.`,
    '',
    `Hi ${nombre}: your building access code has changed. Your new code is ${pin}; the previous one no longer works. Enter it on the keypad at the entrance.`,
  ].join('\n');
}

/** Si a la reserva se le publica el PIN en Hostaway: las directas, no. */
export function publishesPinFor(stay: Pick<GuestStay, 'channelName'>): boolean {
  return !isDirectReservation(stay.channelName);
}

/**
 * Publica el PIN del huésped en Hostaway: lo escribe en el `doorCode` de la
 * reserva cuando la credencial ya está en la puerta (un `pin_conflict` puede
 * cambiarlo antes), lo borra cuando deja de valer y, si el CAV lo renovó, avisa
 * del nuevo por el chat.
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

  private usesWebhook(): boolean {
    return (
      (
        this.configService.get<string>('GUEST_PIN_NOTICE_CHANNEL') ?? ''
      ).toLowerCase() === WEBHOOK_TRANSPORT
    );
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
        `PIN de la estancia ${stayId} no publicado: ${this.describe(error)}`,
      );
      return { outcome: 'failed', reason: this.describe(error) };
    }
  }

  /** El CAV renovó el PIN: deja pendiente el mensaje, que sale cuando el PIN nuevo esté en la puerta. */
  async requestRenewalMessage(
    stay: GuestStay,
    credential: AccessCredential,
  ): Promise<void> {
    if (!this.isEnabled() || !publishesPinFor(stay)) return;

    await this.notices.save(
      this.notices.create({
        credentialId: credential.id,
        guestStayId: stay.id,
        pinFingerprint: credential.pinFingerprint,
        channel: RENEWAL_MESSAGE_CHANNEL,
        target: '',
        status: 'requested',
        httpStatus: null,
        error: null,
      }),
    );
  }

  /** Recoge el empuje diferido, las rotaciones por `pin_conflict`, los reintentos y los borrados. */
  @Cron('*/10 * * * *', { timeZone: BUSINESS_TIMEZONE })
  async sweep(): Promise<void> {
    if (
      this.configService.get<string>('ACCESS_SCHEDULER_ENABLED') !== 'true' ||
      !this.isEnabled()
    ) {
      return;
    }

    // Primero los borrados: si una credencial sustituye a otra, se escribe la nueva después.
    const cleared = await this.clearStale();

    let sent = 0;

    for (const stayId of await this.pendingStayIds()) {
      if ((await this.notify(stayId)).outcome === 'sent') sent += 1;
    }

    if (sent > 0 || cleared > 0) {
      this.logger.log(
        `PIN en reservas de Hostaway: ${sent} escrito(s), ${cleared} borrado(s)`,
      );
    }
  }

  /** Estado del `doorCode` por estancia, con una sola consulta. */
  async statusFor(
    items: { stay: GuestStay; credential: AccessCredential }[],
  ): Promise<Map<string, PinNoticeView>> {
    const views = new Map<string, PinNoticeView>();
    const credentialIds = items.map(({ credential }) => credential.id);
    const rows = credentialIds.length
      ? await this.notices.find({
          where: {
            credentialId: In(credentialIds),
            channel: DOOR_CODE_CHANNEL,
          },
          order: { createdAt: 'DESC' },
        })
      : [];

    for (const { stay, credential } of items) {
      if (!this.isEnabled() || !publishesPinFor(stay)) {
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
      } else if (last?.status === 'failed') {
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

    if (!stay || !LIVE_STAY_STATUSES.includes(stay.status)) {
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

    if (!publishesPinFor(stay)) {
      return { outcome: 'skipped', reason: 'direct_reservation' };
    }

    const doorCode = await this.writeDoorCode(stay, credential, force);
    const renewal = await this.sendRenewalIfRequested(stay, credential);

    return renewal ? { ...doorCode, renewal } : doorCode;
  }

  private async writeDoorCode(
    stay: GuestStay,
    credential: AccessCredential,
    force: boolean,
  ): Promise<PinNoticeResult> {
    if (!force) {
      if (await this.doorCodeWritten(credential)) {
        return { outcome: 'skipped', reason: 'already_sent' };
      }

      if (await this.recentlyFailed(credential, DOOR_CODE_CHANNEL)) {
        return { outcome: 'skipped', reason: 'retry_cooldown' };
      }
    }

    return this.attempt(stay, credential, DOOR_CODE_CHANNEL, async () => {
      const pin = this.credentialService.revealPin(credential);

      if (this.usesWebhook()) {
        return this.postToWebhook('guest-pin.door-code', stay, {
          doorCode: pin,
        });
      }

      await this.hostaway.setReservationDoorCode(
        stay.hostawayReservationId,
        pin,
        DOOR_CODE_INSTRUCTION,
      );

      return `reservation:${stay.hostawayReservationId}`;
    });
  }

  private async sendRenewalIfRequested(
    stay: GuestStay,
    credential: AccessCredential,
  ): Promise<PinNoticeResult | null> {
    if (!(await this.renewalPending(credential))) return null;

    if (await this.recentlyFailed(credential, RENEWAL_MESSAGE_CHANNEL)) {
      return { outcome: 'skipped', reason: 'retry_cooldown' };
    }

    return this.attempt(stay, credential, RENEWAL_MESSAGE_CHANNEL, async () => {
      const message = buildPinRenewedMessage(
        stay.guestName,
        this.credentialService.revealPin(credential),
      );

      if (this.usesWebhook()) {
        return this.postToWebhook('guest-pin.renewal-message', stay, {
          message,
        });
      }

      const conversation = await this.hostaway.findConversationByReservation(
        stay.hostawayReservationId,
      );

      if (!conversation) {
        throw new Error('conversation_not_found');
      }

      await this.hostaway.sendConversationMessage(
        conversation.id,
        message,
        'channel',
      );

      return `conversation:${conversation.id}`;
    });
  }

  /** Ejecuta la acción y deja constancia del intento. Devuelve el desenlace sin lanzar. */
  private async attempt(
    stay: GuestStay,
    credential: AccessCredential,
    channel: string,
    action: () => Promise<string>,
  ): Promise<PinNoticeResult> {
    let target = '';
    let httpStatus: number | null = null;
    let error: string | null = null;

    try {
      target = await action();
    } catch (err) {
      httpStatus =
        err instanceof HttpException
          ? err.getStatus()
          : ((err as AxiosError).response?.status ?? null);
      error = this.describe(err);
    }

    await this.record(
      credential,
      stay.id,
      channel,
      target,
      error ? 'failed' : 'sent',
      httpStatus,
      error,
    );

    if (error) {
      this.logger.warn(
        `${channel} de la estancia ${stay.id} fallido (reserva ${stay.hostawayReservationId}): ${error}`,
      );
      return { outcome: 'failed', reason: error, channel, target };
    }

    this.logger.log(`${channel} de la estancia ${stay.id} hecho en ${target}`);

    return { outcome: 'sent', channel, target };
  }

  /**
   * Borra el `doorCode` que escribimos cuando la estancia ya no tiene ninguna
   * credencial viva o terminó. Un código puesto a mano nunca se toca.
   */
  private async clearStale(): Promise<number> {
    const rows = await this.credentials
      .createQueryBuilder('c')
      .innerJoin(GuestStay, 's', 's.id = c.guest_stay_id')
      .select('c.id', 'credentialId')
      .addSelect('c.pin_fingerprint', 'pinFingerprint')
      .addSelect('s.id', 'stayId')
      .addSelect('s.hostaway_reservation_id', 'reservationId')
      .where('c.subject_type = :guest', { guest: 'guest' })
      .andWhere(
        `(s.status NOT IN (:...stayLive) OR NOT EXISTS (
          SELECT 1 FROM access_credential v
          WHERE v.subject_type = 'guest'
            AND v.subject_ref = c.subject_ref
            AND v.status IN (:...live)))`,
        { stayLive: LIVE_STAY_STATUSES, live: LIVE_STATUSES },
      )
      .andWhere(
        `(SELECT n.status FROM guest_pin_notice n
          WHERE n.credential_id = c.id
            AND n.channel = :doorCode
            AND n.status IN ('sent', 'cleared')
          ORDER BY n.created_at DESC LIMIT 1) = 'sent'`,
        { doorCode: DOOR_CODE_CHANNEL },
      )
      .limit(BATCH_SIZE)
      .getRawMany<{
        credentialId: string;
        pinFingerprint: string;
        stayId: string;
        reservationId: string;
      }>();

    const byStay = new Map<string, typeof rows>();

    for (const row of rows) {
      byStay.set(row.stayId, [...(byStay.get(row.stayId) ?? []), row]);
    }

    let cleared = 0;

    for (const [stayId, group] of byStay) {
      const reservationId = group[0].reservationId;

      try {
        if (this.usesWebhook()) {
          await this.postToWebhook(
            'guest-pin.door-code-cleared',
            { id: stayId, hostawayReservationId: reservationId },
            {},
          );
        } else {
          await this.hostaway.setReservationDoorCode(reservationId, null);
        }
      } catch (error) {
        // Sin fila `cleared`, el siguiente barrido lo reintenta.
        this.logger.warn(
          `doorCode de la reserva ${reservationId} no borrado: ${this.describe(error)}`,
        );
        continue;
      }

      for (const row of group) {
        await this.notices.save(
          this.notices.create({
            credentialId: row.credentialId,
            guestStayId: stayId,
            pinFingerprint: row.pinFingerprint,
            channel: DOOR_CODE_CHANNEL,
            target: `reservation:${reservationId}`,
            status: 'cleared',
            httpStatus: null,
            error: null,
          }),
        );
      }

      cleared += 1;
    }

    return cleared;
  }

  /** Devuelve el destino; lanza si la URL falta o el receptor falla. */
  private async postToWebhook(
    event: string,
    stay: Pick<GuestStay, 'id' | 'hostawayReservationId'> &
      Partial<Pick<GuestStay, 'guestName' | 'channelName'>>,
    payload: Record<string, unknown>,
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
          event,
          sentAt: new Date().toISOString(),
          stayId: stay.id,
          reservationId: stay.hostawayReservationId,
          guestName: stay.guestName ?? null,
          channelName: stay.channelName ?? null,
          ...payload,
        },
        { timeout: WEBHOOK_TIMEOUT_MS },
      ),
    );

    return url;
  }

  private async record(
    credential: AccessCredential,
    stayId: string,
    channel: string,
    target: string,
    status: GuestPinNoticeStatus,
    httpStatus: number | null,
    error: string | null,
  ): Promise<void> {
    await this.notices.save(
      this.notices.create({
        credentialId: credential.id,
        guestStayId: stayId,
        pinFingerprint: credential.pinFingerprint,
        channel,
        target,
        status,
        httpStatus,
        error,
      }),
    );
  }

  /** El último desenlace del `doorCode` para el PIN vigente es una escritura (no un borrado). */
  private async doorCodeWritten(
    credential: AccessCredential,
  ): Promise<boolean> {
    const last = await this.notices.findOne({
      where: {
        credentialId: credential.id,
        pinFingerprint: credential.pinFingerprint,
        channel: DOOR_CODE_CHANNEL,
        status: In(['sent', 'cleared']),
      },
      order: { createdAt: 'DESC' },
    });

    return last?.status === 'sent';
  }

  /** Va por credencial y no por huella: sobrevive a una rotación antes de llegar a la puerta. */
  private async renewalPending(credential: AccessCredential): Promise<boolean> {
    const last = await this.notices.findOne({
      where: {
        credentialId: credential.id,
        channel: RENEWAL_MESSAGE_CHANNEL,
        status: In(['requested', 'sent']),
      },
      order: { createdAt: 'DESC' },
    });

    return last?.status === 'requested';
  }

  private async recentlyFailed(
    credential: AccessCredential,
    channel: string,
  ): Promise<boolean> {
    const cooldownMs = this.retryCooldownMinutes() * 60_000;

    if (cooldownMs <= 0) return false;

    const last = await this.notices.findOne({
      where: {
        credentialId: credential.id,
        channel,
        ...(channel === DOOR_CODE_CHANNEL
          ? { pinFingerprint: credential.pinFingerprint }
          : {}),
      },
      order: { createdAt: 'DESC' },
    });

    return (
      last !== null &&
      last.status === 'failed' &&
      Date.now() - last.createdAt.getTime() < cooldownMs
    );
  }

  /** Estancias de canal con credencial en la puerta y sin `doorCode` para su PIN vigente, o con renovación por avisar. */
  private async pendingStayIds(): Promise<string[]> {
    const rows = await this.credentials
      .createQueryBuilder('c')
      .innerJoin(GuestStay, 's', 's.id = c.guest_stay_id')
      .select('c.guest_stay_id', 'stayId')
      .where('c.subject_type = :guest', { guest: 'guest' })
      .andWhere('c.status IN (:...live)', { live: LIVE_STATUSES })
      .andWhere('c.sync_state = :synced', { synced: 'synced' })
      .andWhere('s.status IN (:...stayLive)', {
        stayLive: LIVE_STAY_STATUSES,
      })
      .andWhere(
        `LOWER(TRIM(COALESCE(s.channel_name, ''))) NOT IN (:...direct)`,
        { direct: ['', ...DIRECT_CHANNEL_NAMES] },
      )
      .andWhere(
        `(COALESCE((SELECT n.status FROM guest_pin_notice n
            WHERE n.credential_id = c.id
              AND n.pin_fingerprint = c.pin_fingerprint
              AND n.channel = :doorCode
              AND n.status IN ('sent', 'cleared')
            ORDER BY n.created_at DESC LIMIT 1), '') <> 'sent'
          OR COALESCE((SELECT n.status FROM guest_pin_notice n
            WHERE n.credential_id = c.id
              AND n.channel = :renewal
              AND n.status IN ('requested', 'sent')
            ORDER BY n.created_at DESC LIMIT 1), '') = 'requested')`,
        { doorCode: DOOR_CODE_CHANNEL, renewal: RENEWAL_MESSAGE_CHANNEL },
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
