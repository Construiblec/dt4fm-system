import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GuestPortalData,
  GuestPortalDataService,
} from '../access-control/guest-portal-data.service';
import { GuestStay } from '../access-control/entities/guest-stay.entity';
import { GuestTokenService } from './guest-token.service';

/** Ruta del frontend que recibe el enlace. Convive con `/owner/dashboard`. */
const GUEST_DASHBOARD_PATH = '/guest/dashboard';

/** El enlace recién emitido. */
export interface IssuedGuestLink {
  url: string;
  token: string;
  stayId: string;
  reservationId: string;
  guestName: string;
  guestEmail: string | null;
  /** Hasta cuándo servirá, según la estancia **en este momento**. */
  accessValidTo: Date;
}

/**
 * Emite y canjea los enlaces con los que el huésped entra a su portal.
 *
 * Reparto de responsabilidades: `GuestTokenService` sabe firmar y verificar,
 * `GuestPortalDataService` sabe leer los datos de accesos, y este servicio sabe
 * **quién tiene derecho a entrar y hasta cuándo**.
 *
 * Todas las decisiones de vigencia se toman contra `guest_stay` en el instante
 * del canje, nunca contra lo que diga el token.
 */
@Injectable()
export class GuestPortalService {
  private readonly logger = new Logger(GuestPortalService.name);

  constructor(
    private readonly data: GuestPortalDataService,
    private readonly guestToken: GuestTokenService,
    private readonly configService: ConfigService,
  ) {}

  // ── Emisión ───────────────────────────────────────────────────────────────

  /**
   * Genera el enlace de una estancia. Se emite aunque el edificio no tenga
   * control de accesos: el portal es más que el PIN, y ese bloque simplemente
   * se sustituye por un aviso.
   */
  async issueLink(stayId: string): Promise<IssuedGuestLink> {
    this.assertConfigured();

    const stay = await this.data.findStay(stayId);

    if (!stay) {
      throw new NotFoundException(`La estancia ${stayId} no existe`);
    }

    if (stay.status === 'cancelled') {
      throw new NotFoundException(
        `La estancia ${stayId} está cancelada y no admite acceso`,
      );
    }

    if (new Date() > stay.accessValidTo) {
      throw new NotFoundException(
        `La estancia ${stayId} ya terminó el ${stay.accessValidTo.toISOString()}`,
      );
    }

    const token = this.guestToken.create(stay.id, stay.tokenVersion);

    this.logger.log(
      `Enlace emitido para la estancia ${stay.id} ` +
        `(reserva ${stay.hostawayReservationId}, versión ${stay.tokenVersion}), ` +
        `vigente hasta ${stay.accessValidTo.toISOString()}`,
    );

    return {
      token,
      url: this.buildUrl(token),
      stayId: stay.id,
      reservationId: stay.hostawayReservationId,
      guestName: stay.guestName,
      guestEmail: stay.guestEmail,
      accessValidTo: stay.accessValidTo,
    };
  }

  private buildUrl(token: string): string {
    const base =
      this.configService.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';

    return `${base}${GUEST_DASHBOARD_PATH}?token=${encodeURIComponent(token)}`;
  }

  // ── Canje ─────────────────────────────────────────────────────────────────

  /**
   * Convierte el token del enlace en los datos del portal, o falla.
   *
   * La firma dice que el enlace lo emitimos nosotros; todo lo demás —si la
   * reserva sigue viva, hasta cuándo vale, si toca mostrar el PIN— sale de
   * `guest_stay` tal como está ahora. Por eso extender el check-out no obliga a
   * reenviar nada, y cancelar la reserva cierra el enlace de inmediato.
   */
  async resolve(token: string): Promise<GuestPortalData> {
    this.assertConfigured();

    const payload = this.guestToken.verify(token?.trim() ?? '');

    if (!payload) {
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    const stay = await this.data.findStay(payload.stayId);

    if (!stay) {
      this.logger.warn(
        `Enlace rechazado: la estancia ${payload.stayId} ya no existe`,
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    this.assertUsable(stay, payload.tokenVersion);

    return this.data.getPortalData(stay);
  }

  /**
   * Las tres razones por las que un enlace bien firmado deja de servir. Se
   * comprueban contra la fila, no contra el token.
   */
  private assertUsable(stay: GuestStay, tokenVersion: number): void {
    // Freno de emergencia: subir `token_version` mata todos los enlaces
    // emitidos para esa estancia. No lo usa el flujo normal — regenerar el PIN
    // no toca el enlace, porque el portal muestra siempre el PIN vigente.
    if (tokenVersion !== stay.tokenVersion) {
      this.logger.warn(
        `Enlace rechazado: la estancia ${stay.id} va por la versión ` +
          `${stay.tokenVersion} y el enlace trae la ${tokenVersion}`,
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    if (stay.status === 'cancelled') {
      this.logger.warn(
        `Enlace rechazado: la estancia ${stay.id} está cancelada`,
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    // El enlace muere con el acceso, en el mismo instante en que la puerta deja
    // de aceptar el PIN. Antes del check-in sí abre: enseña la estadía y avisa
    // de cuándo aparecerá el código.
    if (new Date() > stay.accessValidTo) {
      this.logger.warn(
        `Enlace rechazado: la estancia ${stay.id} terminó el ` +
          stay.accessValidTo.toISOString(),
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }
  }

  private assertConfigured(): void {
    if (!this.guestToken.isConfigured()) {
      throw new ServiceUnavailableException(
        'El portal del huésped no está disponible en este momento.',
      );
    }
  }

  /**
   * Un único mensaje para todos los motivos de rechazo. Distinguir entre
   * "firma inválida", "vencido" y "reserva cancelada" le diría a quien prueba
   * enlaces qué tan cerca está de acertar.
   */
  private invalidTokenMessage(): string {
    return (
      'El enlace no es válido o ya venció. Escríbenos para que te enviemos ' +
      'uno nuevo.'
    );
  }
}
