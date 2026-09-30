export type DoorScope = "pedestrian" | "vehicular";

export const DOOR_SCOPE_LABELS: Record<DoorScope, string> = {
  pedestrian: "Peatonal",
  vehicular: "Vehicular",
};

/** Fases de interfaz: las dos mandan el mismo pulso a la barrera vehicular. */
export type DoorAction = "open" | "close";

/**
 * Fase de la barrera según los pulsos que mandó el backend; no es su posición.
 * `closable`: se puede pulsar «Cerrar»; `settling`: puede estar bajando y nadie
 * pulsa; `uncertain`: un pulso sin confirmar que hay que revisar a mano.
 */
export type DoorPhase = "ready" | "closable" | "settling" | "uncertain";

/** `triggered`: el pulso salió, nada sobre la posición; `uncertain`: pudo salir. */
export type DoorCommandOutcome = "triggered" | "failed" | "uncertain";

export type DoorLastCommand = {
  action: DoorAction;
  /** `attempted` solo mientras la orden está en vuelo; `opened`/`closed`, historial previo a `trigger`. */
  outcome: DoorCommandOutcome | "attempted" | "opened" | "closed";
  at: string;
  actorType: "guest" | "staff";
  actorUsername: string | null;
};

export type Door = {
  deviceId: string;
  kind: string;
  scope: DoorScope;
  online: boolean;
  /** Barrera vehicular con tiempos medidos: la única que se pulsa a distancia. */
  remoteControl: boolean;
  phase: DoorPhase | null;
  lastCommand: DoorLastCommand | null;
  /** Fin de la ventana de cierre. */
  openUntil: string | null;
  /** Fin del cierre automático: hasta entonces nadie pulsa. */
  settlesAt: string | null;
};

export type DoorBuilding = {
  buildingId: number;
  name: string;
  online: boolean;
  doors: Door[];
};

export type DoorsOverview = {
  /** Con `false`, la apertura remota está apagada en el backend. */
  enabled: boolean;
  buildings: DoorBuilding[];
};

export type DoorCommandResult = {
  requestId: string;
  deviceId: string;
  outcome: DoorCommandOutcome;
  errorCode?: string;
  at?: string;
  openUntil: string | null;
};
