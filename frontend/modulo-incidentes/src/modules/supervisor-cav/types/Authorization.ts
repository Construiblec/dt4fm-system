/**
 * A qué tipo de acceso habilita el PIN. `pedestrian` es el valor por
 * defecto de toda reserva nueva; `both` sale de marcar peatonal y vehicular
 * a la vez en el checklist de "Cambiar nivel de accesos".
 *
 * Son los mismos tres valores que el backend llama `scope` en la credencial.
 */
export type AccessLevel = "pedestrian" | "vehicular" | "both";

/** Lo que elige el supervisor: `none` revoca el acceso a todas las puertas. */
export type AccessLevelChoice = AccessLevel | "none";

/** Cada puerta por separado: peatonal (incluye lavadoras) y vehicular. */
export type AccessScope = "pedestrian" | "vehicular";

/** Estado final que se envía al backend. */
export const ACCESS_SCOPES_BY_LEVEL: Record<AccessLevelChoice, AccessScope[]> =
  {
    pedestrian: ["pedestrian"],
    vehicular: ["vehicular"],
    both: ["pedestrian", "vehicular"],
    none: [],
  };

/** `confirmed`: las puertas ya reflejan lo pedido; `pending`/`failed`, todavía no. */
export type AccessSyncStatus = "confirmed" | "pending" | "failed";

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
  /** Check-in y check-out de la reserva, ISO con zona. */
  checkIn: string;
  checkOut: string;
  /** Vigencia del PIN: la reserva con márgenes antes y después, ISO con zona. */
  pinValidFrom: string;
  pinValidTo: string;
  /** `null` si el CAV revocó el acceso. */
  accessLevel: AccessLevel | null;
  /** Lo pedido y lo confirmado en las puertas; difieren mientras `syncStatus` no es `confirmed`. */
  desiredScopes?: AccessScope[];
  confirmedScopes?: AccessScope[];
  syncStatus?: AccessSyncStatus;
  /** Código del último fallo, p. ej. `pin_conflict`. */
  syncError?: string | null;
  /** Quién y cuándo lo revocó; `null` si el acceso está vigente. */
  accessRevoked: { at: string; by: string | null } | null;
  /** Si el PIN quedó guardado en la reserva de Hostaway; `not_applicable` si está apagado o revocado. */
  pinNotice?: {
    status: "sent" | "failed" | "pending" | "not_applicable";
    at: string | null;
    error: string | null;
    /** Si al renovar se avisa por el chat de Hostaway (las directas, no). */
    renewalMessage?: boolean;
  };
};

export type ListAuthorizationsParams = {
  /** `YYYY-MM-DD`. */
  from?: string;
  to?: string;
};

export type ListAuthorizationsResponse = { data: Authorization[] };
export type AuthorizationResponse = { data: Authorization };
