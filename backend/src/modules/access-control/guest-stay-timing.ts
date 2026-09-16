import { ConfigService } from '@nestjs/config';
import { GuestStay } from './entities/guest-stay.entity';

/**
 * Ecuador es UTC−5 todo el año, sin horario de verano. Es el único punto donde
 * una fecha de Hostaway (`YYYY-MM-DD`) se convierte en un instante; si algún
 * día hay un edificio en otra zona, se cambia aquí.
 */
export const LOCAL_UTC_OFFSET = '-05:00';

export const DEFAULT_CHECKIN_HOUR = 15;
export const DEFAULT_CHECKOUT_HOUR = 11;
export const DEFAULT_LEAD_HOURS = 3;
export const DEFAULT_GRACE_HOURS = 3;

const HOUR_MS = 60 * 60 * 1000;

/** Hora 0–23 de una variable de entorno, o el respaldo si falta o no es válida. */
export const configHour = (
  config: ConfigService,
  name: string,
  fallback: number,
): number => {
  const raw = Number(config.get<string>(name));

  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : fallback;
};

export const leadHours = (config: ConfigService): number =>
  configHour(config, 'ACCESS_GUEST_LEAD_HOURS', DEFAULT_LEAD_HOURS);

export const graceHours = (config: ConfigService): number =>
  configHour(config, 'ACCESS_GUEST_GRACE_HOURS', DEFAULT_GRACE_HOURS);

export const atLocalHour = (
  date: string,
  hour: number,
  offsetHours: number,
): Date => {
  const base = new Date(
    `${date}T${String(hour).padStart(2, '0')}:00:00${LOCAL_UTC_OFFSET}`,
  );

  return new Date(base.getTime() + offsetHours * HOUR_MS);
};

/**
 * El check-in exacto no se guarda: `access_valid_from` ya lleva restado el
 * margen. Se reconstruye con el margen vigente, que el barrido diario alinea.
 */
export const checkInInstant = (accessValidFrom: Date, lead: number): Date =>
  new Date(accessValidFrom.getTime() + lead * HOUR_MS);

export const checkOutInstant = (accessValidTo: Date, grace: number): Date =>
  new Date(accessValidTo.getTime() - grace * HOUR_MS);

export type IncidentEligibility =
  | 'ok'
  | 'cancelada'
  | 'antes-del-checkin'
  | 'finalizada'
  | 'sin-edificio';

/** Regla única para mostrar el reporte en el portal y para aceptarlo en el servidor. */
export const incidentEligibility = (
  stay: {
    stayStatus: GuestStay['status'];
    buildingId: number | null;
    checkInAt: Date;
    accessValidTo: Date;
  },
  now: Date,
): IncidentEligibility => {
  if (stay.stayStatus === 'cancelled') return 'cancelada';
  if (now < stay.checkInAt) return 'antes-del-checkin';
  if (now > stay.accessValidTo) return 'finalizada';
  if (stay.buildingId === null) return 'sin-edificio';

  return 'ok';
};
