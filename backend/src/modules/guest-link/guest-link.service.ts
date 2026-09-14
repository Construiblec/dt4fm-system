import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GUEST_LINK_CHANNEL } from './delivery/guest-link-channel.interface';
import type {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './delivery/guest-link-channel.interface';
import { GuestLinkDelivery } from './entities/guest-link-delivery.entity';
import { GuestTokenService } from './guest-token.service';

/** Ruta del frontend que recibe el enlace. Convive con `/owner/dashboard`. */
const GUEST_DASHBOARD_PATH = '/guest/dashboard';

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
    private readonly tokens: GuestTokenService,
    @Inject(GUEST_LINK_CHANNEL) private readonly channel: GuestLinkChannel,
    private readonly configService: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.tokens.isConfigured();
  }

  /** Emite el enlace de una estancia. No decide si la estancia lo merece. */
  issue(
    stay: Pick<GuestLinkStayInput, 'id' | 'tokenVersion'>,
  ): IssuedGuestLink {
    const token = this.tokens.create(stay.id, stay.tokenVersion);

    return { token, url: this.buildUrl(token) };
  }

  /**
   * Entrega el enlace por el canal configurado y deja constancia.
   *
   * **Nunca lanza.** Quien llama suele ser la proyección de una reserva, y un
   * canal caído no puede impedir que la estancia y su PIN existan. El fallo
   * queda en `guest_link_delivery` para reenviarlo a mano.
   *
   * Sin `force`, se salta si ya hubo un envío correcto para esta estancia con
   * el `token_version` vigente: es lo que evita reenviar en cada modificación
   * de Hostaway. Subir `token_version` (freno de emergencia) invalida ese
   * envío previo y vuelve a enviar.
   */
  async deliver(
    stay: GuestLinkStayInput,
    options: { force?: boolean } = {},
  ): Promise<GuestLinkDeliveryResult> {
    if (!options.force && (await this.alreadySent(stay))) {
      return { outcome: 'skipped', channel: this.channel.name, target: '' };
    }

    const { url } = this.issue(stay);
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

    await this.deliveries.save(
      this.deliveries.create({
        guestStayId: stay.id,
        tokenVersion: stay.tokenVersion,
        channel: this.channel.name,
        target: result.target,
        status: result.success ? 'sent' : 'failed',
        httpStatus: result.httpStatus ?? null,
        error: result.error ?? null,
      }),
    );

    if (result.success) {
      this.logger.log(
        `Enlace de la estancia ${stay.id} entregado por ${this.channel.name}`,
      );
    } else {
      this.logger.warn(
        `Enlace de la estancia ${stay.id} NO entregado por ${this.channel.name}: ${result.error ?? 'sin motivo'}`,
      );
    }

    return {
      outcome: result.success ? 'sent' : 'failed',
      channel: this.channel.name,
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

  private payloadFor(stay: GuestLinkStayInput, url: string): GuestLinkPayload {
    return {
      event: 'guest-link.issued',
      issuedAt: new Date().toISOString(),
      stay: {
        id: stay.id,
        reservationId: stay.hostawayReservationId,
        guestName: stay.guestName,
        guestEmail: stay.guestEmail,
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

  private buildUrl(token: string): string {
    const base =
      this.configService.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';

    return `${base}${GUEST_DASHBOARD_PATH}?token=${encodeURIComponent(token)}`;
  }
}
