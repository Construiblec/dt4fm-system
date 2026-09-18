export type DoorScope = "pedestrian" | "vehicular";

export const DOOR_SCOPE_LABELS: Record<DoorScope, string> = {
  pedestrian: "Peatonal",
  vehicular: "Vehicular",
};

/** Solo las vehiculares se cierran a mano: las peatonales se traban solas. */
export type DoorAction = "open" | "close";

/** `uncertain`: la orden salió, pero nadie confirmó si la puerta se movió. */
export type DoorCommandOutcome = "opened" | "closed" | "failed" | "uncertain";

export type DoorLastCommand = {
  action: DoorAction;
  /** `attempted` solo mientras la orden está en vuelo. */
  outcome: DoorCommandOutcome | "attempted";
  at: string;
  actorType: "guest" | "staff";
  actorUsername: string | null;
};

export type Door = {
  deviceId: string;
  kind: string;
  scope: DoorScope;
  online: boolean;
  lastCommand: DoorLastCommand | null;
  /** Barrera vehicular aún arriba: hasta cuándo, antes de bajar sola. */
  openUntil: string | null;
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
