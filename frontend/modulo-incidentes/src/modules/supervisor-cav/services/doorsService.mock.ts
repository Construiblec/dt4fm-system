import type {
  Door,
  DoorAction,
  DoorCommandOutcome,
  DoorCommandResult,
  DoorsOverview,
} from "@/modules/supervisor-cav/types/Door";

/** Tiempos ficticios, como los de las pruebas del backend: en producción se miden en sitio. */
const CLOSE_WINDOW_MS = 40_000;
const AUTO_CLOSE_MS = 90_000;

const door = (
  deviceId: string,
  scope: Door["scope"],
  online = true,
): Door => ({
  deviceId,
  kind: scope === "vehicular" ? "barrier" : "terminal",
  scope,
  online,
  remoteControl: scope === "vehicular",
  phase: scope === "vehicular" ? "ready" : null,
  lastCommand: null,
  openUntil: null,
  settlesAt: null,
});

/** Mismas puertas que `access-iot.mock.ts` del backend: `PRA-VEHICULAR-1` caída a propósito. */
const overview: DoorsOverview = {
  enabled: true,
  buildings: [
    {
      buildingId: 3025058,
      name: "Inglaterra",
      online: true,
      doors: [
        door("ING-PEATONAL-1", "pedestrian"),
        door("ING-VEHICULAR-1", "vehicular"),
      ],
    },
    {
      buildingId: 3019998,
      name: "Pradera",
      online: true,
      doors: [
        door("PRA-PEATONAL-1", "pedestrian"),
        door("PRA-VEHICULAR-1", "vehicular", false),
      ],
    },
  ],
};

const delay = () => new Promise((resolve) => setTimeout(resolve, 600));

const findDoor = (deviceId: string): Door | undefined =>
  overview.buildings
    .flatMap((building) => building.doors)
    .find((door) => door.deviceId === deviceId);

export const mockListDoors = async (): Promise<DoorsOverview> => {
  await delay();

  const now = Date.now();
  for (const target of overview.buildings.flatMap((b) => b.doors)) {
    if (target.settlesAt && new Date(target.settlesAt).getTime() <= now) {
      Object.assign(target, { phase: "ready", openUntil: null, settlesAt: null });
    } else if (target.openUntil && new Date(target.openUntil).getTime() <= now) {
      Object.assign(target, { phase: "settling", openUntil: null });
    }
  }

  return structuredClone(overview);
};

export const mockCommandDoor = async (
  deviceId: string,
  action: DoorAction,
  requestId: string,
): Promise<DoorCommandResult> => {
  await delay();

  const target = findDoor(deviceId);
  const at = new Date().toISOString();
  const outcome: DoorCommandOutcome = target?.online ? "triggered" : "failed";
  const opened = outcome === "triggered" && action === "open";
  const openUntil = opened
    ? new Date(Date.now() + CLOSE_WINDOW_MS).toISOString()
    : null;

  if (target) {
    target.lastCommand = {
      action,
      outcome,
      at,
      actorType: "staff",
      actorUsername: "cav.mock",
    };
    if (outcome === "triggered") {
      Object.assign(target, {
        phase: opened ? "closable" : "ready",
        openUntil,
        settlesAt: opened
          ? new Date(Date.now() + AUTO_CLOSE_MS).toISOString()
          : null,
      });
    }
  }

  return {
    requestId,
    deviceId,
    outcome,
    errorCode: outcome === "failed" ? "device_unreachable" : undefined,
    at,
    openUntil,
  };
};

export const mockResolveDoor = async (deviceId: string): Promise<void> => {
  await delay();

  const target = findDoor(deviceId);
  if (target) Object.assign(target, { phase: "ready", openUntil: null, settlesAt: null });
};
