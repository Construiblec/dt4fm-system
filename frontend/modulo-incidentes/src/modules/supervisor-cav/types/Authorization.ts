/**
 * `ready`: hay un PIN vigente (autogenerado o ya enviado) para esta reserva.
 * `pending`: se pidió un PIN nuevo y todavía no se ha enviado al huésped.
 *
 * El código del PIN nunca viaja al frontend — se genera y se entrega desde el
 * sistema de control de acceso, no desde esta app.
 */
export type PinStatus = "ready" | "pending";

export type Authorization = {
  id: number;
  guestName: string;
  /** "Torre A · UI R302", ya compuesto por el backend. */
  unitLabel: string;
  /** ISO con zona. */
  checkIn: string;
  /** ISO con zona; también la fecha hasta la que el PIN es válido. */
  checkOut: string;
  pinStatus: PinStatus;
  /** Último envío del PIN al huésped, si lo hubo. */
  lastSentAt: string | null;
};

export type ListAuthorizationsParams = {
  /** `YYYY-MM-DD`. */
  from?: string;
  to?: string;
};

export type ListAuthorizationsResponse = { data: Authorization[] };
export type AuthorizationResponse = { data: Authorization };
