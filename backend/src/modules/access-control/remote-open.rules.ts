import { ConfigService } from '@nestjs/config';
import { AccessIotDevice, DoorAction } from './access-iot.types';
import { GuestStay } from './entities/guest-stay.entity';
import { RemoteOpenStatus } from './entities/remote-open-request.entity';
import { GatePhase } from './entities/vehicular-gate-phase.entity';

/** Tras esto, un `attempted` sin cerrar es una orden que murió a medias. */
export const STALE_ATTEMPT_MS = 30_000;

/** Por barrera y para cualquier pulso: Abrir y Cerrar son la misma orden física. */
export const PULSE_COOLDOWN_MS = 10_000;

/** Fin del enfriamiento que abrió el último pulso; nulo si ya pasó. */
export const cooldownEnd = (
  lastPulseAt: Date | null,
  now: Date,
): Date | null => {
  if (!lastPulseAt) return null;

  const until = new Date(lastPulseAt.getTime() + PULSE_COOLDOWN_MS);

  return until > now ? until : null;
};

/** Apagado salvo `"true"`: es control físico (guía de la VPS, §10). */
export const remoteOpenEnabled = (config: ConfigService): boolean =>
  config.get<string>('ACCESS_REMOTE_OPEN_ENABLED') === 'true';

/** La API central solo acepta `trigger` sobre la barrera vehicular de cada edificio. */
export const isRemoteGate = (device: Pick<AccessIotDevice, 'kind' | 'scope'>) =>
  device.kind === 'barrier' && device.scope === 'vehicular';

export interface GateTimings {
  /** Desde el pulso, hasta cuándo quien abrió puede pulsar «Cerrar». */
  closeWindowMs: number;
  /** Desde el pulso, cuándo seguro terminó de bajar sola. */
  autoCloseMs: number;
}

/**
 * Lee `ACCESS_VEHICULAR_GATE_TIMINGS`, medido en sitio:
 * `{"<buildingId>":{"closeWindowSeconds":40,"autoCloseSeconds":90}}`. Sin
 * cifras, o con una ventana que no termina antes del cierre automático, el
 * edificio no ofrece el botón.
 */
export const gateTimings = (
  raw: string | undefined,
  buildingId: number | null,
): GateTimings | null => {
  if (buildingId === null || !raw?.trim()) return null;

  let entry: { closeWindowSeconds?: unknown; autoCloseSeconds?: unknown };
  try {
    entry = (JSON.parse(raw) as Record<string, typeof entry>)?.[
      String(buildingId)
    ];
  } catch {
    return null;
  }

  const closeWindow = Number(entry?.closeWindowSeconds);
  const autoClose = Number(entry?.autoCloseSeconds);

  if (
    !Number.isFinite(closeWindow) ||
    !Number.isFinite(autoClose) ||
    closeWindow <= 0 ||
    closeWindow >= autoClose
  ) {
    return null;
  }

  return { closeWindowMs: closeWindow * 1000, autoCloseMs: autoClose * 1000 };
};

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
 * Lo que la interfaz deja hacer. `closable`: quien abrió o el Supervisor CAV
 * puede «Cerrar»; `settling`: puede estar bajando y nadie pulsa. Es una ayuda
 * de interfaz: no ve aperturas por PIN, mando o consola local.
 */
export type EffectivePhase = 'ready' | 'closable' | 'settling' | 'uncertain';

export interface GatePhaseState {
  phase: GatePhase;
  pulsedAt: Date | null;
  updatedAt: Date;
}

export const effectivePhase = (
  state: GatePhaseState | null,
  staleAttemptAt: Date | null,
  timings: GateTimings,
  now: Date,
): EffectivePhase => {
  // Una orden que murió a medias pudo dar pulso: vale lo mismo que un `ambiguous`.
  if (staleAttemptAt && (!state || staleAttemptAt > state.updatedAt)) {
    return 'uncertain';
  }

  if (!state || state.phase === 'ready') return 'ready';
  if (state.phase === 'uncertain') return 'uncertain';

  const elapsed = now.getTime() - (state.pulsedAt ?? state.updatedAt).getTime();

  if (elapsed < timings.closeWindowMs) return 'closable';
  if (elapsed < timings.autoCloseMs) return 'settling';

  return 'ready';
};

export type PulseRefusal =
  | 'ok'
  | 'en-uso'
  | 'bajando'
  | 'sin-confirmar'
  | 'sin-ventana'
  | 'de-otro';

/** Con un pulso único, el «Abrir» de otro sobre una barrera abierta es un «Cerrar». */
export const pulseRefusal = (
  action: DoorAction,
  phase: EffectivePhase,
  actor: { type: 'guest'; stayId: string } | { type: 'staff' },
  openedByStayId: string | null,
): PulseRefusal => {
  if (phase === 'uncertain') return 'sin-confirmar';

  if (action === 'open') {
    if (phase === 'closable') return 'en-uso';
    if (phase === 'settling') return 'bajando';

    return 'ok';
  }

  if (phase !== 'closable') return 'sin-ventana';
  if (actor.type === 'guest' && openedByStayId !== actor.stayId) {
    return 'de-otro';
  }

  return 'ok';
};
