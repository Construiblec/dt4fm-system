/**
 * Contrato del canal por el que el enlace del portal llega al huésped.
 *
 * Calcado de `MailProvider`: la lógica de negocio (`GuestLinkService`) depende
 * solo de este contrato, nunca de un canal concreto. Para añadir correo o
 * WhatsApp basta con una clase nueva y una rama más en el factory de
 * `guest-link.module.ts`; nada más cambia.
 */

/** Lo que viaja al canal. **Nunca** lleva el PIN ni el token suelto: solo la URL. */
export interface GuestLinkPayload {
  event: 'guest-link.issued';
  /** Instante de emisión, ISO. */
  issuedAt: string;
  stay: {
    id: string;
    reservationId: string;
    guestName: string;
    guestEmail: string | null;
    arrivalDate: string;
    departureDate: string;
    accessValidFrom: string;
    accessValidTo: string;
    buildingId: number | null;
    openmaintUnitId: number | null;
  };
  link: {
    url: string;
  };
}

export interface GuestLinkSendResult {
  success: boolean;
  /** A dónde se envió, tal como lo entienda el canal (URL, correo, número). */
  target: string;
  /** Código HTTP cuando aplica. */
  httpStatus?: number;
  /** Motivo legible cuando `success` es `false`. */
  error?: string;
}

/** Token de inyección del canal activo; se resuelve en `guest-link.module.ts`. */
export const GUEST_LINK_CHANNEL = Symbol('GUEST_LINK_CHANNEL');

export interface GuestLinkChannel {
  /** Nombre del canal, para el registro de envíos y los logs. */
  readonly name: string;

  /** Entrega el enlace. **No debe lanzar**: devuelve el resultado. */
  send(payload: GuestLinkPayload): Promise<GuestLinkSendResult>;
}
