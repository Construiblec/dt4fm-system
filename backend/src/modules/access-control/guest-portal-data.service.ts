import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CredentialService } from './credential.service';
import { GuestStay } from './entities/guest-stay.entity';
import {
  AccessCredential,
  CredentialScope,
  SyncState,
} from './entities/access-credential.entity';
import {
  checkInInstant,
  checkOutInstant,
  graceHours,
  incidentEligibility,
  leadHours,
} from './guest-stay-timing';
import { DoorAction } from './access-iot.types';
import { guestGateEligibility, remoteOpenEnabled } from './remote-open.rules';
import { RemoteOpenResult, RemoteOpenService } from './remote-open.service';

/**
 * Por qué el portal no ve su PIN todavía, cuando no lo ve.
 *
 * `sin-cobertura` no es un error: Batán y Republica no tienen puertas con PIN,
 * y su estancia existe igual porque `guest_stay` es el cimiento del portal, no
 * un accesorio de las credenciales.
 */
export type GuestPinState =
  | 'disponible'
  | 'antes-del-checkin'
  | 'finalizado'
  | 'sin-cobertura';

/** Lo que el portal muestra. El PIN solo viene cuando toca mostrarlo. */
export interface GuestPortalData {
  stayId: string;
  reservationId: string;
  guestName: string;
  guestEmail: string | null;
  listingId: string;
  openmaintUnitId: number | null;
  buildingId: number | null;
  arrivalDate: string;
  departureDate: string;
  accessValidFrom: Date;
  accessValidTo: Date;
  /** Check-in y check-out exactos, sin los márgenes de acceso. */
  checkInAt: Date;
  checkOutAt: Date;
  stayStatus: GuestStay['status'];
  pinState: GuestPinState;
  pin: string | null;
  /** Diagnóstico: si la credencial existe pero no llegó a la puerta. */
  credentialId: string | null;
  syncState: SyncState | null;
  hasVehicularAccess: boolean;
  /** Misma regla que aplica `POST /guest/vehicular-gate/open`. */
  canOpenVehicularGate: boolean;
  /** Mientras no sea nulo, este huésped puede bajar la barrera que abrió. */
  vehicularGateOpenUntil: Date | null;
  /** Misma regla que aplica `POST /guest/incidents`, calculada en un solo sitio. */
  canReportIncident: boolean;
}

/** La credencial que el portal muestra cuando hay varias vivas. */
const SCOPE_PRIORITY: CredentialScope[] = ['both', 'pedestrian', 'vehicular'];

/**
 * Única superficie por la que el portal del huésped llega a los datos de
 * accesos.
 *
 * Existe para que `CredentialService` —y con él `revealPin()`, el único punto
 * del código autorizado a descifrar un PIN— **no salga de este módulo**. El
 * módulo del portal recibe datos ya resueltos y nunca la capacidad de descifrar
 * el PIN de una credencial arbitraria.
 *
 * El PIN se descifra solo cuando además se va a mostrar: fuera de la ventana de
 * acceso ni siquiera se pide.
 */
@Injectable()
export class GuestPortalDataService {
  constructor(
    @InjectRepository(GuestStay)
    private readonly stays: Repository<GuestStay>,
    private readonly credentials: CredentialService,
    private readonly configService: ConfigService,
    private readonly remoteOpen: RemoteOpenService,
  ) {}

  findStay(stayId: string): Promise<GuestStay | null> {
    return this.stays.findOne({ where: { id: stayId } });
  }

  /** La estancia sale de los datos que resolvió el token, nunca de la petición. */
  commandVehicularGate(
    guest: GuestPortalData,
    action: DoorAction,
    requestId: string,
  ): Promise<RemoteOpenResult> {
    return this.remoteOpen.forGuest(guest, action, requestId);
  }

  async getPortalData(
    stay: GuestStay,
    now: Date = new Date(),
  ): Promise<GuestPortalData> {
    const credential = this.pickCredential(
      await this.credentials.findLiveForGuest(stay.hostawayReservationId),
    );

    const checkInAt = checkInInstant(
      stay.accessValidFrom,
      leadHours(this.configService),
    );

    const base = {
      stayId: stay.id,
      reservationId: stay.hostawayReservationId,
      guestName: stay.guestName,
      guestEmail: stay.guestEmail,
      listingId: stay.listingId,
      openmaintUnitId: stay.openmaintUnitId,
      buildingId: stay.buildingId,
      arrivalDate: stay.arrivalDate,
      departureDate: stay.departureDate,
      accessValidFrom: stay.accessValidFrom,
      accessValidTo: stay.accessValidTo,
      checkInAt,
      checkOutAt: checkOutInstant(
        stay.accessValidTo,
        graceHours(this.configService),
      ),
      stayStatus: stay.status,
      canReportIncident:
        incidentEligibility(
          {
            stayStatus: stay.status,
            buildingId: stay.buildingId,
            checkInAt,
            accessValidTo: stay.accessValidTo,
          },
          now,
        ) === 'ok',
    };

    if (!credential) {
      return {
        ...base,
        pinState: 'sin-cobertura',
        pin: null,
        credentialId: null,
        syncState: null,
        hasVehicularAccess: false,
        canOpenVehicularGate: false,
        vehicularGateOpenUntil: null,
      };
    }

    const pinState = this.pinStateFor(stay, now);
    const hasVehicularAccess = credential.scope !== 'pedestrian';
    const canOpenVehicularGate =
      remoteOpenEnabled(this.configService) &&
      guestGateEligibility(
        {
          stayStatus: stay.status,
          accessValidFrom: stay.accessValidFrom,
          accessValidTo: stay.accessValidTo,
          hasVehicularAccess,
        },
        now,
      ) === 'ok';

    return {
      ...base,
      pinState,
      // El descifrado ocurre únicamente cuando el PIN se va a mostrar.
      pin:
        pinState === 'disponible'
          ? this.credentials.revealPin(credential)
          : null,
      credentialId: credential.id,
      syncState: credential.syncState,
      hasVehicularAccess,
      canOpenVehicularGate,
      vehicularGateOpenUntil: canOpenVehicularGate
        ? await this.remoteOpen.guestOpenUntil(stay.id, stay.buildingId)
        : null,
    };
  }

  /** Determinista: con varias vivas, gana la de mayor alcance y luego la más antigua. */
  private pickCredential(
    live: AccessCredential[],
  ): AccessCredential | undefined {
    for (const scope of SCOPE_PRIORITY) {
      const match = live.find((credential) => credential.scope === scope);

      if (match) return match;
    }

    return undefined;
  }

  /**
   * La ventana la manda `guest_stay`, no el token del enlace: así el portal y
   * la puerta no pueden discrepar, y adelantar la llegada o extender la salida
   * se refleja sin reemitir nada.
   */
  private pinStateFor(stay: GuestStay, now: Date): GuestPinState {
    if (now < stay.accessValidFrom) {
      return 'antes-del-checkin';
    }

    // Defensivo: el portal rechaza el enlace vencido antes de llegar aquí.
    if (now > stay.accessValidTo) {
      return 'finalizado';
    }

    return 'disponible';
  }
}
