import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GUEST_LINK_CHANNEL } from './delivery/guest-link-channel.interface';
import type {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './delivery/guest-link-channel.interface';
import { GuestLinkDelivery } from './entities/guest-link-delivery.entity';
import { GuestShortLink } from './entities/guest-short-link.entity';
import { GuestTokenService } from './guest-token.service';

/** Ruta corta del frontend que canjea el código por el token. */
const GUEST_SHORT_LINK_PATH = '/g';

// 62^10 ≈ 2^59: inadivinable por fuerza bruta con el rate-limit del canje.
const SHORT_CODE_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHORT_CODE_LENGTH = 10;
const SHORT_CODE_PATTERN = /^[0-9A-Za-z]{10}$/;

// Descarta bytes >= 248 (múltiplo de 62) para que ningún carácter salga más a menudo.
const newShortCode = (): string => {
  let code = '';

  while (code.length < SHORT_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte >= 248) continue;
      code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
      if (code.length === SHORT_CODE_LENGTH) break;
    }
  }

  return code;
};

const hashShortCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex');

/**
 * Lo que este módulo necesita saber de una estancia. Es un DTO plano y no la
 * entidad `GuestStay` a propósito: así `guest-link` no importa nada de
 * `access-control`, y puede ser importado por él sin crear un ciclo. La
 * entidad es estructuralmente compatible, se pasa tal cual.
 */
export interface GuestLinkStayInput {
  id: string;
  tokenVersion: number;
  hostawayReservationId: string;
  guestName: string;
  guestEmail: string | null;
  channelName: string | null;
  arrivalDate: string;
  departureDate: string;
  accessValidFrom: Date;
  accessValidTo: Date;
  buildingId: number | null;
  openmaintUnitId: number | null;
}

export interface IssuedGuestLink {
  url: string;
  token: string;
}

export interface GuestLinkDeliveryResult {
  /** `skipped` cuando ya había un envío correcto y no se forzó. */
  outcome: 'sent' | 'failed' | 'skipped';
  channel: string;
  target: string;
  httpStatus?: number;
  error?: string;
}

/**
 * La única fábrica de enlaces del portal, y quien los entrega.
 *
 * Vive en su propio módulo porque lo necesitan dos sitios que no pueden
 * depender uno del otro: `access-control`, donde nace la estancia y por tanto
 * el momento de enviar, y `guest-portal`, que valida el enlace al abrirse.
 */
@Injectable()
export class GuestLinkService {
  private readonly logger = new Logger(GuestLinkService.name);

  constructor(
    @InjectRepository(GuestLinkDelivery)
    private readonly deliveries: Repository<GuestLinkDelivery>,
    @InjectRepository(GuestShortLink)
    private readonly shortLinks: Repository<GuestShortLink>,
    private readonly tokens: GuestTokenService,
    @Inject(GUEST_LINK_CHANNEL) private readonly channel: GuestLinkChannel,
    private readonly configService: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.tokens.isConfigured();
  }

  /** Emite el enlace (corto) de una estancia. No decide si la estancia lo merece. */
  async issue(
    stay: Pick<GuestLinkStayInput, 'id' | 'tokenVersion'>,
  ): Promise<IssuedGuestLink> {
    const token = this.tokens.create(stay.id, stay.tokenVersion);
    const code = newShortCode();

    await this.shortLinks.save(
      this.shortLinks.create({
        codeHash: hashShortCode(code),
        guestStayId: stay.id,
        tokenVersion: stay.tokenVersion,
      }),
    );

    return { token, url: this.buildUrl(code) };
  }

  /** Token de la estancia a la que apunta el código, o `null`. No decide vigencia. */
  async redeem(
    code: string,
  ): Promise<{ stayId: string; tokenVersion: number; token: string } | null> {
    if (!SHORT_CODE_PATTERN.test(code)) return null;

    const link = await this.shortLinks.findOne({
      where: { codeHash: hashShortCode(code) },
    });

    if (!link) return null;

    return {
      stayId: link.guestStayId,
      tokenVersion: link.tokenVersion,
      token: this.tokens.create(link.guestStayId, link.tokenVersion),
    };
  }

  /**
   * Entrega el enlace por el canal configurado y deja constancia.
   *
   * **Nunca lanza.** Quien llama suele ser la proyección de una reserva, y un
   * canal caído no puede impedir que la estancia y su PIN existan. El fallo
   * queda en `guest_link_delivery` para reintentarlo o reenviarlo a mano.
   *
   * Sin `force`, se salta en dos casos: si ya hubo un envío correcto para esta
   * estancia con el `token_version` vigente —lo que evita reenviar en cada
   * modificación de Hostaway—, o si el último intento falló hace menos de
   * `GUEST_LINK_RETRY_COOLDOWN_MINUTES` —lo que evita ráfagas cuando Hostaway
   * manda varios `reservation.updated` seguidos. Subir `token_version` (freno
   * de emergencia) invalida el envío previo y vuelve a enviar.
   */
  async deliver(
    stay: GuestLinkStayInput,
    options: { force?: boolean } = {},
  ): Promise<GuestLinkDeliveryResult> {
    if (!options.force) {
      if (await this.alreadySent(stay)) {
        return { outcome: 'skipped', channel: this.channel.name, target: '' };
      }

      if (await this.recentlyFailed(stay)) {
        return {
          outcome: 'skipped',
          channel: this.channel.name,
          target: '',
          error: 'retry_cooldown',
        };
      }
    }

    const { url } = await this.issue(stay);
    const payload = this.payloadFor(stay, url);

    let result: GuestLinkSendResult;

    try {
      result = await this.channel.send(payload);
    } catch (error) {
      // El contrato dice que el canal no lanza, pero un canal nuevo mal hecho
      // no puede tumbar la proyección de reservas.
      result = {
        success: false,
        target: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const channelUsed = result.channel ?? this.channel.name;

    await this.deliveries.save(
      this.deliveries.create({
        guestStayId: stay.id,
        tokenVersion: stay.tokenVersion,
        channel: channelUsed,
        target: result.target,
        status: result.success ? 'sent' : 'failed',
        httpStatus: result.httpStatus ?? null,
        error: result.error ?? null,
      }),
    );

    if (result.success) {
      this.logger.log(
        `Enlace de la estancia ${stay.id} entregado por ${channelUsed}`,
      );
    } else {
      this.logger.warn(
        `Enlace de la estancia ${stay.id} NO entregado por ${channelUsed}: ${result.error ?? 'sin motivo'}`,
      );
    }

    return {
      outcome: result.success ? 'sent' : 'failed',
      channel: channelUsed,
      target: result.target,
      httpStatus: result.httpStatus,
      error: result.error,
    };
  }

  private async alreadySent(stay: GuestLinkStayInput): Promise<boolean> {
    return this.deliveries.exists({
      where: {
        guestStayId: stay.id,
        tokenVersion: stay.tokenVersion,
        status: 'sent',
      },
    });
  }

  private async recentlyFailed(stay: GuestLinkStayInput): Promise<boolean> {
    const cooldownMs = this.retryCooldownMinutes() * 60_000;

    if (cooldownMs <= 0) {
      return false;
    }

    const last = await this.deliveries.findOne({
      where: { guestStayId: stay.id, tokenVersion: stay.tokenVersion },
      order: { createdAt: 'DESC' },
    });

    return (
      last !== null &&
      last.status === 'failed' &&
      Date.now() - last.createdAt.getTime() < cooldownMs
    );
  }

  private retryCooldownMinutes(): number {
    const raw = Number(
      this.configService.get<string>('GUEST_LINK_RETRY_COOLDOWN_MINUTES'),
    );

    return Number.isFinite(raw) && raw >= 0 ? raw : 60;
  }

  private payloadFor(stay: GuestLinkStayInput, url: string): GuestLinkPayload {
    return {
      event: 'guest-link.issued',
      issuedAt: new Date().toISOString(),
      stay: {
        id: stay.id,
        reservationId: stay.hostawayReservationId,
        guestName: stay.guestName,
        guestEmail: stay.guestEmail,
        channelName: stay.channelName,
        arrivalDate: stay.arrivalDate,
        departureDate: stay.departureDate,
        accessValidFrom: stay.accessValidFrom.toISOString(),
        accessValidTo: stay.accessValidTo.toISOString(),
        buildingId: stay.buildingId,
        openmaintUnitId: stay.openmaintUnitId,
      },
      link: { url },
    };
  }

  private buildUrl(code: string): string {
    const base =
      this.configService.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';

    return `${base}${GUEST_SHORT_LINK_PATH}/${code}`;
  }
}
