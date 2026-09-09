import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { HostawayGuestReservation } from '../../integrations/hostaway/hostaway.mock';
import { GuestTokenService } from './guest-token.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Ruta del frontend que recibe el enlace. Convive con `/owner/dashboard`. */
const GUEST_DASHBOARD_PATH = '/guest/dashboard';

/** Horas de adelanto por defecto sobre el check-in. */
const DEFAULT_LEAD_HOURS = 24;

/** Horas de cortesía por defecto después del check-out. */
const DEFAULT_GRACE_HOURS = 24;

/**
 * Tope duro de la ventana, pase lo que pase con las fechas de Hostaway. Una
 * reserva de larga estadía —o una con fechas mal cargadas— no debería producir
 * un enlace vivo durante años: si hace falta más, se emite otro.
 */
const MAX_WINDOW_DAYS = 60;

/** Estados de reserva que dan derecho a entrar. Mismo criterio que limpieza. */
const VALID_RESERVATION_STATUSES = ['new', 'modified', 'confirmed'];

/**
 * Cuánto se recuerda la reserva releída. El dashboard encadena varias
 * peticiones seguidas y cada una pasa por el guard: sin caché, cada pantalla
 * del huésped costaría varias llamadas a Hostaway.
 */
const RESERVATION_CACHE_TTL_MS = 5 * 60 * 1000;

/** Ventana de validez calculada a partir del check-in y el check-out. */
export type GuestAccessWindow = {
  notBefore: number;
  expiresAt: number;
};

/** El enlace recién emitido. */
export type IssuedMagicLink = GuestAccessWindow & {
  url: string;
  token: string;
  reservationId: number;
  guestName: string;
  guestEmail: string | null;
};

/** Quién es el que llama, resuelto desde su magiclink. */
export type GuestIdentity = {
  reservationId: number;
  guestName: string;
  guestEmail: string | null;
  listingName: string;
  listingMapId: string;
  arrivalDate: string;
  departureDate: string;
  confirmationCode: string;
  nights: number;
  /** Cuándo deja de servir el enlace con el que entró. */
  expiresAt: number;
};

/**
 * Emite y canjea los magiclinks con los que el huésped entra a su dashboard.
 *
 * Reparto de responsabilidades: `GuestTokenService` sabe firmar y verificar,
 * este servicio sabe **de dónde salen las fechas y a quién pertenecen**. La
 * ventana no se inventa —se calcula del check-in y el check-out que devuelve
 * Hostaway— y al canjear el token la reserva se relee, de modo que una
 * cancelación o un cambio de fechas se reflejan en enlaces ya enviados.
 */
@Injectable()
export class GuestAccessService {
  private readonly logger = new Logger(GuestAccessService.name);
  private readonly cache = new Map<
    number,
    { reservation: HostawayGuestReservation | null; cachedAt: number }
  >();

  constructor(
    private readonly hostawayService: HostawayService,
    private readonly guestToken: GuestTokenService,
    private readonly configService: ConfigService,
  ) {}

  // ── Emisión ───────────────────────────────────────────────────────────────

  /**
   * Genera el enlace de una reserva. Lo llamará el envío por correo cuando esa
   * pieza exista; por ahora se expone también por HTTP para poder probarlo.
   */
  async issueMagicLink(reservationId: number): Promise<IssuedMagicLink> {
    if (!this.guestToken.isConfigured()) {
      throw new ServiceUnavailableException(
        'El acceso de huéspedes no está configurado (falta GUEST_MAGICLINK_SECRET)',
      );
    }

    const reservation =
      await this.hostawayService.getReservationById(reservationId);

    if (!reservation) {
      throw new NotFoundException(
        `La reserva ${reservationId} no existe en Hostaway`,
      );
    }

    if (!this.hasValidStatus(reservation)) {
      throw new NotFoundException(
        `La reserva ${reservationId} está en estado "${reservation.status}" y no admite acceso`,
      );
    }

    const window = this.buildWindow(reservation);
    const token = this.guestToken.create(
      reservation.id,
      window.notBefore,
      window.expiresAt,
    );

    this.logger.log(
      `Magiclink emitido para la reserva ${reservation.id} ` +
        `(${reservation.arrivalDate} -> ${reservation.departureDate}), válido ` +
        `${new Date(window.notBefore).toISOString()} -> ` +
        `${new Date(window.expiresAt).toISOString()}`,
    );

    return {
      ...window,
      token,
      url: this.buildUrl(token),
      reservationId: reservation.id,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
    };
  }

  /**
   * Traduce check-in y check-out a la ventana del enlace.
   *
   * Las fechas de Hostaway son `YYYY-MM-DD` sin hora ni zona. Se toman como
   * medianoche UTC —el día de llegada desde su inicio, el de salida hasta su
   * final— y los márgenes en horas absorben con holgura la diferencia con la
   * hora local de la propiedad (Ecuador es UTC-5 todo el año). Con las 24 h por
   * defecto a cada lado ese desfase no cambia en nada el resultado práctico,
   * así que no se arrastra una librería de zonas horarias solo para esto.
   */
  private buildWindow(
    reservation: HostawayGuestReservation,
  ): GuestAccessWindow {
    const checkIn = Date.parse(`${reservation.arrivalDate}T00:00:00Z`);
    const checkOut = Date.parse(`${reservation.departureDate}T23:59:59Z`);

    if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut)) {
      throw new ServiceUnavailableException(
        `La reserva ${reservation.id} no trae fechas utilizables ` +
          `(llegada "${reservation.arrivalDate}", salida "${reservation.departureDate}")`,
      );
    }

    if (checkOut < checkIn) {
      throw new ServiceUnavailableException(
        `La reserva ${reservation.id} tiene la salida antes que la llegada`,
      );
    }

    const notBefore = checkIn - this.leadHours() * HOUR_MS;
    const expiresAt = Math.min(
      checkOut + this.graceHours() * HOUR_MS,
      notBefore + MAX_WINDOW_DAYS * DAY_MS,
    );

    return { notBefore, expiresAt };
  }

  private leadHours(): number {
    return this.positiveHours('GUEST_LINK_LEAD_HOURS', DEFAULT_LEAD_HOURS);
  }

  private graceHours(): number {
    return this.positiveHours('GUEST_LINK_GRACE_HOURS', DEFAULT_GRACE_HOURS);
  }

  /** Un valor ausente o sin sentido cae al defecto en vez de romper la emisión. */
  private positiveHours(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return fallback;
    }

    const hours = Number(raw);

    if (!Number.isFinite(hours) || hours < 0) {
      this.logger.warn(`${key}="${raw}" no es válido; se usan ${fallback} h`);
      return fallback;
    }

    return hours;
  }

  private buildUrl(token: string): string {
    const base =
      this.configService.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? '';

    return `${base}${GUEST_DASHBOARD_PATH}?token=${encodeURIComponent(token)}`;
  }

  // ── Canje ─────────────────────────────────────────────────────────────────

  /**
   * Convierte el token del enlace en la identidad del huésped, o falla.
   *
   * Son dos comprobaciones distintas y las dos hacen falta. La firma dice que
   * el token lo emitimos nosotros y que su ventana no se tocó; la relectura en
   * Hostaway dice que la reserva **sigue siendo la misma**. Sin la segunda, el
   * enlace de una reserva cancelada seguiría abriendo hasta su vencimiento,
   * porque al no guardarse no hay nada que se pueda revocar.
   */
  async resolve(token: string): Promise<GuestIdentity> {
    if (!this.guestToken.isConfigured()) {
      throw new ServiceUnavailableException(
        'El acceso de huéspedes no está disponible en este momento.',
      );
    }

    const payload = this.guestToken.verify(token?.trim() ?? '');

    if (!payload) {
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    const reservation = await this.readReservation(payload.reservationId);

    if (!reservation || !this.hasValidStatus(reservation)) {
      this.logger.warn(
        `Magiclink rechazado: la reserva ${payload.reservationId} ` +
          `${reservation ? `está en estado "${reservation.status}"` : 'ya no existe'}`,
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    // Las fechas pueden haber cambiado después de emitir el enlace. Se recalcula
    // la ventana con las actuales y vale la intersección de ambas: adelantar la
    // salida acorta el acceso sin tener que reemitir nada.
    const current = this.buildWindow(reservation);
    const notBefore = Math.max(payload.notBefore, current.notBefore);
    const expiresAt = Math.min(payload.expiresAt, current.expiresAt);
    const now = Date.now();

    if (now < notBefore || now > expiresAt) {
      this.logger.warn(
        `Magiclink fuera de ventana tras releer la reserva ${reservation.id}`,
      );
      throw new UnauthorizedException(this.invalidTokenMessage());
    }

    return {
      reservationId: reservation.id,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      listingName: reservation.listingName,
      listingMapId: reservation.listingMapId,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      confirmationCode: reservation.confirmationCode,
      nights: reservation.nights,
      expiresAt,
    };
  }

  /** Descarta la reserva cacheada; útil tras modificarla en Hostaway. */
  forget(reservationId: number): void {
    this.cache.delete(reservationId);
  }

  private async readReservation(
    reservationId: number,
  ): Promise<HostawayGuestReservation | null> {
    const cached = this.cache.get(reservationId);

    if (cached && Date.now() - cached.cachedAt < RESERVATION_CACHE_TTL_MS) {
      return cached.reservation;
    }

    const reservation =
      await this.hostawayService.getReservationById(reservationId);

    // También se cachea el `null`: si la reserva no existe, no tiene sentido
    // volver a preguntarlo en cada petición de un enlace que insista.
    this.cache.set(reservationId, { reservation, cachedAt: Date.now() });

    return reservation;
  }

  private hasValidStatus(reservation: HostawayGuestReservation): boolean {
    return VALID_RESERVATION_STATUSES.includes(reservation.status);
  }

  /**
   * Un único mensaje para todos los motivos de rechazo. Distinguir entre
   * "firma inválida", "vencido" y "reserva cancelada" le diría a quien prueba
   * tokens qué tan cerca está de acertar.
   */
  private invalidTokenMessage(): string {
    return (
      'El enlace no es válido o ya venció. Escríbenos para que te enviemos ' +
      'uno nuevo.'
    );
  }
}
