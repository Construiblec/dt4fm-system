import {
  mockCommandDoor,
  mockListDoors,
} from "@/modules/supervisor-cav/services/doorsService.mock";
import {
  cavApi,
  getAuthHeaders,
  handleUnauthorized,
  isCavMock,
} from "@/modules/supervisor-cav/services/cavApi";
import type {
  DoorAction,
  DoorCommandResult,
  DoorsOverview,
} from "@/modules/supervisor-cav/types/Door";

/**
 * Endpoints del backend (módulo `access-control`):
 *
 *   GET  /access-doors                   puertas por edificio y última orden
 *   POST /access-doors/:deviceId/open    { requestId }
 *   POST /access-doors/:deviceId/close   { requestId }  solo vehiculares
 */
export const listDoors = async (): Promise<DoorsOverview> => {
  if (isCavMock) return mockListDoors();

  try {
    const { data } = await cavApi.get<{ data: DoorsOverview }>(
      "/access-doors",
      { headers: getAuthHeaders() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** El mismo `requestId` devuelve el resultado guardado sin repetir el pulso. */
export const commandDoor = async (
  deviceId: string,
  action: DoorAction,
  requestId: string,
): Promise<DoorCommandResult> => {
  if (isCavMock) return mockCommandDoor(deviceId, action, requestId);

  try {
    const { data } = await cavApi.post<{ data: DoorCommandResult }>(
      `/access-doors/${encodeURIComponent(deviceId)}/${action}`,
      { requestId },
      { headers: getAuthHeaders() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
