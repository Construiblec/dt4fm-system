import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UnitLocation,
  UnitResolverService,
} from '../../integrations/openmaint/unit-resolver.service';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { GuestStay } from './entities/guest-stay.entity';

/**
 * Ecuador es UTC−5 todo el año, sin horario de verano. Es el único punto donde
 * una fecha de Hostaway (`YYYY-MM-DD`) se convierte en un instante; si algún
 * día hay un edificio en otra zona, se cambia aquí.
 */
const LOCAL_UTC_OFFSET = '-05:00';

const DEFAULT_CHECKIN_HOUR = 15;
const DEFAULT_CHECKOUT_HOUR = 11;
const DEFAULT_LEAD_HOURS = 3;
const DEFAULT_GRACE_HOURS = 3;

/**
 * Lista blanca, no negra. Con una lista negra cualquier estado nuevo o
 * inesperado emitía PIN: `inquiry` —una consulta de alguien interesado, que ni
 * siquiera es una reserva— abría la puerta del edificio.
 */
const ISSUING_STATUSES = ['new', 'modified', 'confirmed', 'ownerstay'];

const CANCELLED_STATUSES = [
  'cancelled',
  'declined',
  'expired',
  'inquirydenied',
  'inquirytimedout',
  'inquirynotpossible',
];

export interface ReservationInput {
  hostawayReservationId: string;
  listingId: string;
  guestName: string;
  guestEmail?: string | null;
  arrivalDate: string;
  departureDate: string;
  status?: string | null;
  /** Horas de la propia reserva. Hostaway las da por reserva y no son iguales
   * en todos los listings; las variables de entorno son solo el respaldo. */
  checkInTime?: number | null;
  checkOutTime?: number | null;
  issuedBy: string;
  /** El webhook no puede esperar a la VPS dentro del plazo de Hostaway. */
  deferSync?: boolean;
}

@Injectable()
export class GuestStayService {
  private readonly logger = new Logger(GuestStayService.name);

  constructor(
    @InjectRepository(GuestStay)
    private readonly stays: Repository<GuestStay>,
    private readonly unitResolver: UnitResolverService,
    private readonly catalog: BuildingCatalogService,
    private readonly credentialService: CredentialService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Proyecta la reserva **siempre**, tenga o no el edificio control de accesos:
   * `guest_stay` es el cimiento del portal, no un accesorio de los PINes. Solo
   * la emisión depende de la cobertura.
   */
  async upsertFromReservation(
    input: ReservationInput,
  ): Promise<GuestStay | null> {
    if (!this.isCancelled(input.status) && !this.isIssuing(input.status)) {
      // Ni emite ni revoca: una consulta o una reserva a medias no es una
      // estancia, y crearla ensuciaría el cimiento del portal.
      this.logger.log(
        `Reserva ${input.hostawayReservationId} en estado "${input.status ?? ''}": no se proyecta`,
      );
      return null;
    }

    const stay = await this.persist(input);

    if (this.isCancelled(input.status)) {
      const revoked = await this.credentialService.revokeByGuestStay(
        stay.id,
        'reservation_cancelled',
        input.deferSync,
      );

      if (revoked > 0) {
        this.logger.log(
          `Reserva ${stay.hostawayReservationId} cancelada: ${revoked} credencial(es) revocada(s)`,
        );
      }

      return stay;
    }

    await this.syncCredential(stay, input.issuedBy, input.deferSync);

    return stay;
  }

  private async persist(input: ReservationInput): Promise<GuestStay> {
    const existing = await this.stays.findOne({
      where: { hostawayReservationId: input.hostawayReservationId },
    });

    const location = await this.resolveLocation(input, existing);
    const accessValidFrom = this.atLocalHour(
      input.arrivalDate,
      this.reservationHour(
        input.checkInTime,
        'ACCESS_CHECKIN_HOUR',
        DEFAULT_CHECKIN_HOUR,
      ),
      -this.hour('ACCESS_GUEST_LEAD_HOURS', DEFAULT_LEAD_HOURS),
    );
    const accessValidTo = this.atLocalHour(
      input.departureDate,
      this.reservationHour(
        input.checkOutTime,
        'ACCESS_CHECKOUT_HOUR',
        DEFAULT_CHECKOUT_HOUR,
      ),
      this.hour('ACCESS_GUEST_GRACE_HOURS', DEFAULT_GRACE_HOURS),
    );

    const stay = this.stays.create({
      ...(existing ?? {}),
      hostawayReservationId: input.hostawayReservationId,
      listingId: input.listingId,
      // Un listing sin mapear no rompe nada: el PIN funciona, solo falta el
      // nombre del departamento en el futuro panel.
      openmaintUnitId: location?.unitId ?? existing?.openmaintUnitId ?? null,
      buildingId: location?.buildingId ?? existing?.buildingId ?? null,
      guestName: input.guestName,
      guestEmail: input.guestEmail ?? null,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      accessValidFrom,
      accessValidTo,
      status: this.isCancelled(input.status)
        ? 'cancelled'
        : this.statusFromDates(accessValidFrom, accessValidTo),
    });

    return this.stays.save(stay);
  }

  /** Emite si no había credencial, y solo mueve la vigencia si ya la había. */
  private async syncCredential(
    stay: GuestStay,
    issuedBy: string,
    deferSync?: boolean,
  ): Promise<void> {
    if (stay.buildingId === null) {
      this.logger.warn(
        `Reserva ${stay.hostawayReservationId}: sin edificio resuelto, no se emite credencial`,
      );
      return;
    }

    if (!(await this.catalog.isCovered(stay.buildingId))) {
      // Caso normal, no error: Batán y Republica no tienen puertas con PIN.
      this.logger.log(
        `Reserva ${stay.hostawayReservationId}: el edificio ${stay.buildingId} no tiene control de accesos`,
      );
      return;
    }

    // Sin fijar el ámbito: si a este huésped le ampliaron el acceso a mano
    // (p. ej. a `both` porque trajo vehículo), buscar solo `pedestrian`
    // devolvería null y acabaríamos emitiéndole un segundo PIN.
    const existing = await this.credentialService.findLiveBySubject(
      'guest',
      stay.hostawayReservationId,
    );

    if (existing) {
      const cambio =
        existing.validFrom.getTime() !== stay.accessValidFrom.getTime() ||
        existing.validTo.getTime() !== stay.accessValidTo.getTime();

      if (cambio) {
        // Cambiar el PIN por un cambio de fechas confundiría al huésped, que
        // ya lo tiene anotado.
        await this.credentialService.reschedule(
          existing.id,
          stay.accessValidFrom,
          stay.accessValidTo,
          deferSync,
        );
      }

      return;
    }

    await this.credentialService.issue({
      subjectType: 'guest',
      subjectRef: stay.hostawayReservationId,
      displayName: stay.guestName,
      scope: 'pedestrian',
      buildingId: stay.buildingId,
      openmaintUnitId: stay.openmaintUnitId,
      validFrom: stay.accessValidFrom,
      validTo: stay.accessValidTo,
      issuedBy,
      guestStayId: stay.id,
      deferSync,
    });
  }

  /**
   * openMAINT caído solo es fatal sin edificio que reutilizar: sin él no se emite,
   * y el 503 deja reintentar a Hostaway. Una cancelación no necesita edificio.
   */
  private async resolveLocation(
    input: ReservationInput,
    existing: GuestStay | null,
  ): Promise<UnitLocation | null> {
    try {
      return await this.unitResolver.byListingId(input.listingId);
    } catch (error) {
      if (existing?.buildingId != null || this.isCancelled(input.status)) {
        return null;
      }

      throw new ServiceUnavailableException(
        `openMAINT no resolvió el listing ${input.listingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private statusFromDates(from: Date, to: Date): GuestStay['status'] {
    const now = Date.now();

    if (now > to.getTime()) return 'completed';
    if (now >= from.getTime()) return 'active';

    return 'pending';
  }

  private isCancelled(status?: string | null): boolean {
    return CANCELLED_STATUSES.includes((status ?? '').toLowerCase());
  }

  private isIssuing(status?: string | null): boolean {
    return ISSUING_STATUSES.includes((status ?? '').toLowerCase());
  }

  /** La hora de la reserva manda; la variable de entorno solo cubre su ausencia. */
  private reservationHour(
    fromReservation: number | null | undefined,
    envName: string,
    fallback: number,
  ): number {
    if (
      Number.isInteger(fromReservation) &&
      fromReservation! >= 0 &&
      fromReservation! <= 23
    ) {
      return fromReservation!;
    }

    return this.hour(envName, fallback);
  }

  private atLocalHour(date: string, hour: number, offsetHours: number): Date {
    const base = new Date(
      `${date}T${String(hour).padStart(2, '0')}:00:00${LOCAL_UTC_OFFSET}`,
    );

    return new Date(base.getTime() + offsetHours * 60 * 60 * 1000);
  }

  private hour(name: string, fallback: number): number {
    const raw = Number(this.configService.get<string>(name));

    return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : fallback;
  }
}
