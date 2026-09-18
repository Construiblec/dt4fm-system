import { ConfigService } from '@nestjs/config';
import { AccessIotErrorCode, DoorCommandOutcome } from './access-iot.types';
import { GuestStay } from './entities/guest-stay.entity';
import { RemoteOpenStatus } from './entities/remote-open-request.entity';

/** Tras esto, un `attempted` sin cerrar es una orden que murió a medias. */
export const STALE_ATTEMPT_MS = 30_000;

/** La barrera vehicular baja sola pasado este tiempo; hasta entonces se puede cerrar a mano. */
export const VEHICULAR_AUTO_CLOSE_MS = 60_000;

/** Apagado salvo `"true"`: es control físico (guía de la VPS, §10). */
export const remoteOpenEnabled = (config: ConfigService): boolean =>
  config.get<string>('ACCESS_REMOTE_OPEN_ENABLED') === 'true';

export type GuestGateEligibility =
  | 'ok'
  | 'cancelada'
  | 'antes-del-checkin'
  | 'finalizada'
  | 'sin-vehicular';

/** Regla única para mostrar el botón en el portal y para aceptar la orden en el servidor. */
export const guestGateEligibility = (
  stay: {
    stayStatus: GuestStay['status'];
    accessValidFrom: Date;
    accessValidTo: Date;
    hasVehicularAccess: boolean;
  },
  now: Date,
): GuestGateEligibility => {
  if (stay.stayStatus === 'cancelled') return 'cancelada';
  if (now < stay.accessValidFrom) return 'antes-del-checkin';
  if (now > stay.accessValidTo) return 'finalizada';
  if (!stay.hasVehicularAccess) return 'sin-vehicular';

  return 'ok';
};

export const effectiveStatus = (
  row: { status: RemoteOpenStatus; requestedAt: Date },
  now: Date,
): RemoteOpenStatus =>
  row.status === 'attempted' &&
  now.getTime() - row.requestedAt.getTime() > STALE_ATTEMPT_MS
    ? 'uncertain'
    : row.status;

/**
 * Hasta cuándo sigue arriba la barrera según la última orden confirmada: solo
 * si fue una apertura y aún no pasó el cierre automático.
 */
export const openUntil = (
  lastConfirmed: { status: RemoteOpenStatus; requestedAt: Date } | null,
  now: Date,
): Date | null => {
  if (lastConfirmed?.status !== 'opened') return null;

  const until = new Date(
    lastConfirmed.requestedAt.getTime() + VEHICULAR_AUTO_CLOSE_MS,
  );

  return until > now ? until : null;
};

export interface DeviceCommandOutcome {
  deviceId: string;
  outcome: DoorCommandOutcome;
  errorCode?: AccessIotErrorCode | null;
  at?: string;
}

/** Con varias puertas, basta con que una responda: es lo que el usuario necesita saber. */
export const aggregateOutcome = (
  results: DeviceCommandOutcome[],
): {
  outcome: DoorCommandOutcome;
  errorCode?: AccessIotErrorCode;
  at?: string;
} => {
  const pick =
    results.find(
      (result) => result.outcome === 'opened' || result.outcome === 'closed',
    ) ??
    results.find((result) => result.outcome === 'uncertain') ??
    results[0];

  return {
    outcome: pick.outcome,
    errorCode: pick.errorCode ?? undefined,
    at: pick.at,
  };
};
