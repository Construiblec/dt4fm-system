/**
 * A qué tipo de acceso habilita el PIN. `pedestrian` es el valor por
 * defecto de toda reserva nueva; `both` sale de marcar peatonal y vehicular
 * a la vez en el checklist de "Cambiar nivel de accesos".
 *
 * Son los mismos tres valores que el backend llama `scope` en la credencial.
 */
export type AccessLevel = "pedestrian" | "vehicular" | "both";

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  pedestrian: "Acceso peatonal",
  vehicular: "Acceso vehicular",
  both: "Peatonal y vehicular",
};

export type Authorization = {
  /**
   * `guest_stay.id` del backend: un uuid, no el id de la reserva en Hostaway.
   */
  id: string;
  guestName: string;
  /** "Pradera · UI R302", ya compuesto por el backend. */
  unitLabel: string;
  /** ISO con zona. Inicio de la ventana de acceso. */
  checkIn: string;
  /** ISO con zona; también la fecha hasta la que el PIN es válido. */
  checkOut: string;
  accessLevel: AccessLevel;
};

export type ListAuthorizationsParams = {
  /** `YYYY-MM-DD`. */
  from?: string;
  to?: string;
};

export type ListAuthorizationsResponse = { data: Authorization[] };
export type AuthorizationResponse = { data: Authorization };
