import {
  mockCommandDoor,
  mockListDoors,
  mockResolveDoor,
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
 *   GET  /access-doors                    puertas por edificio, fase y último pulso
 *   POST /access-doors/:deviceId/open     { requestId }  fase «Abrir»
 *   POST /access-doors/:deviceId/close    { requestId }  fase «Cerrar»
 *   POST /access-doors/:deviceId/resolve  libera una barrera sin confirmar
 *
 * Solo barreras vehiculares: open y close mandan el mismo pulso (`trigger`).
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

/** Tras revisar una barrera con un pulso sin confirmar, la devuelve a «Abrir». */
export const resolveDoor = async (deviceId: string): Promise<void> => {
  if (isCavMock) return mockResolveDoor(deviceId);

  try {
    await cavApi.post(
      `/access-doors/${encodeURIComponent(deviceId)}/resolve`,
      {},
      { headers: getAuthHeaders() },
    );
  } catch (error) {
    return handleUnauthorized(error);
  }
};
