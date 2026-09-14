import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CredentialService } from './credential.service';
import { GuestStay } from './entities/guest-stay.entity';
import { SyncState } from './entities/access-credential.entity';

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
  stayStatus: GuestStay['status'];
  pinState: GuestPinState;
  pin: string | null;
  /** Diagnóstico: si la credencial existe pero no llegó a la puerta. */
  credentialId: string | null;
  syncState: SyncState | null;
}

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
  ) {}

  findStay(stayId: string): Promise<GuestStay | null> {
    return this.stays.findOne({ where: { id: stayId } });
  }

  async getPortalData(
    stay: GuestStay,
    now: Date = new Date(),
  ): Promise<GuestPortalData> {
    // Sin fijar el ámbito, igual que hace la emisión automática: a un huésped
    // con vehículo pueden haberle ampliado la credencial a `both`.
    const credential = await this.credentials.findLiveBySubject(
      'guest',
      stay.hostawayReservationId,
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
      stayStatus: stay.status,
    };

    if (!credential) {
      return {
        ...base,
        pinState: 'sin-cobertura',
        pin: null,
        credentialId: null,
        syncState: null,
      };
    }

    const pinState = this.pinStateFor(stay, now);

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
    };
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
