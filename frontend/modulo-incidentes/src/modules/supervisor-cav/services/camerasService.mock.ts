import { AxiosError, type AxiosResponse } from "axios";
import type {
  CamerasOverview,
  LiveSession,
} from "@/modules/supervisor-cav/types/Camera";

/** Mismas cámaras que `access-iot.mock.ts` del backend: `PRA-CAM-02` sin cupos a propósito. */
const overview: CamerasOverview = {
  enabled: true,
  stale: false,
  buildings: [
    {
      buildingId: 3025058,
      name: "Inglaterra",
      reachable: true,
      cameras: [
        { cameraId: "ING-CAM-01", name: "Acceso vehicular" },
        { cameraId: "ING-CAM-02", name: "Lobby" },
      ],
    },
    {
      buildingId: 3019998,
      name: "Pradera",
      reachable: true,
      cameras: [
        { cameraId: "PRA-CAM-01", name: "Acceso vehicular" },
        { cameraId: "PRA-CAM-02", name: "Parqueadero" },
      ],
    },
  ],
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockListCameras = async (): Promise<CamerasOverview> => {
  await delay(400);
  return structuredClone(overview);
};

export const mockCreateLiveSession = async (
  cameraId: string,
  requestId: string,
): Promise<LiveSession> => {
  await delay(500);

  if (cameraId === "PRA-CAM-02") {
    const data = {
      statusCode: 503,
      code: "live_capacity_reached",
      message: "Hay demasiadas cámaras abiertas",
    };
    throw new AxiosError(data.message, "ERR_BAD_RESPONSE", undefined, undefined, {
      status: 503,
      data,
    } as AxiosResponse);
  }

  return {
    requestId,
    cameraId,
    buildingId: cameraId.startsWith("PRA") ? 3019998 : 3025058,
    whepUrl: `mock://live/${cameraId}/whep`,
    ticket: "mock",
    ticketExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    // Corto para ver el fin de sesión sin esperar cinco minutos.
    maxDurationSeconds: 30,
    iceServers: [],
    iceTransportPolicy: "relay",
  };
};
