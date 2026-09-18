import type {
  Door,
  DoorAction,
  DoorCommandResult,
  DoorsOverview,
} from "@/modules/supervisor-cav/types/Door";

/** Igual que el backend: la barrera vehicular baja sola al minuto. */
const AUTO_CLOSE_MS = 60_000;

const door = (
  deviceId: string,
  scope: Door["scope"],
  online = true,
): Door => ({
  deviceId,
  kind: scope === "vehicular" ? "barrier" : "terminal",
  scope,
  online,
  lastCommand: null,
  openUntil: null,
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
    if (target.openUntil && new Date(target.openUntil).getTime() <= now) {
      target.openUntil = null;
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
  const outcome = !target?.online
    ? "failed"
    : action === "open"
      ? "opened"
      : "closed";
  const openUntil =
    outcome === "opened" && target?.scope === "vehicular"
      ? new Date(Date.now() + AUTO_CLOSE_MS).toISOString()
      : null;

  if (target) {
    target.lastCommand = {
      action,
      outcome,
      at,
      actorType: "staff",
      actorUsername: "cav.mock",
    };
    if (outcome !== "failed") target.openUntil = openUntil;
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
