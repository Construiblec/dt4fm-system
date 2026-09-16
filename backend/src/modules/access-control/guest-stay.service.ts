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
import { GuestLinkService } from '../guest-link/guest-link.service';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { GuestStay } from './entities/guest-stay.entity';
import {
  atLocalHour,
  configHour,
  DEFAULT_CHECKIN_HOUR,
  DEFAULT_CHECKOUT_HOUR,
  graceHours,
  leadHours,
} from './guest-stay-timing';

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
  guestPhone?: string | null;
  /** `channelName` de Hostaway. Decide por dónde se entrega el enlace. */
  channelName?: string | null;
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
    private readonly guestLink: GuestLinkService,
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

    const { stay, created } = await this.persist(input);

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

    // `deliver()` es idempotente: salta si ya hubo un envío correcto, así que
    // una modificación no reenvía un enlace ya entregado (sigue valiendo porque
    // no lleva fechas dentro). Llamarlo también en las actualizaciones es lo
    // que reintenta los fallos —p. ej. la conversación de Airbnb que aún no
    // existía en `reservation.created`—. Se entrega aunque el edificio no
    // tenga lector, porque el portal es más que el PIN.
    // TEMPORAL: mientras se valida el envío automático con una reserva real,
    // solo se entrega si el huésped es la reserva de prueba (evita mandarle
    // el enlace a huéspedes reales conectados por Hostaway). Quitar este
    // filtro cuando termine la prueba piloto.
    if (
      (created || stay.status !== 'completed') &&
      stay.guestName?.includes('Pame')
    ) {
      await this.deliverLink(stay);
    }

    return stay;
  }

  /**
   * Best-effort, igual que el webhook de reservas: un canal de entrega caído no
   * puede impedir que la estancia y su PIN existan. El fallo queda registrado
   * en `guest_link_delivery` para reenviarlo a mano.
   */
  private async deliverLink(stay: GuestStay): Promise<void> {
    try {
      await this.guestLink.deliver(stay);
    } catch (error) {
      this.logger.error(
        `No se pudo entregar el enlace de la estancia ${stay.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async persist(
    input: ReservationInput,
  ): Promise<{ stay: GuestStay; created: boolean }> {
    const existing = await this.stays.findOne({
      where: { hostawayReservationId: input.hostawayReservationId },
    });

    const location = await this.resolveLocation(input, existing);
    const accessValidFrom = atLocalHour(
      input.arrivalDate,
      this.reservationHour(
        input.checkInTime,
        'ACCESS_CHECKIN_HOUR',
        DEFAULT_CHECKIN_HOUR,
      ),
      -leadHours(this.configService),
    );
    const accessValidTo = atLocalHour(
      input.departureDate,
      this.reservationHour(
        input.checkOutTime,
        'ACCESS_CHECKOUT_HOUR',
        DEFAULT_CHECKOUT_HOUR,
      ),
      graceHours(this.configService),
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
      // Un evento que no traiga el campo no borra el valor ya conocido.
      guestPhone: input.guestPhone?.trim() || existing?.guestPhone || null,
      channelName: input.channelName?.trim() || existing?.channelName || null,
      arrivalDate: input.arrivalDate,
      departureDate: input.departureDate,
      accessValidFrom,
      accessValidTo,
      status: this.isCancelled(input.status)
        ? 'cancelled'
        : this.statusFromDates(accessValidFrom, accessValidTo),
    });

    return { stay: await this.stays.save(stay), created: existing === null };
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

    return configHour(this.configService, envName, fallback);
  }
}
