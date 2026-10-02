import {
  mockCreateLiveSession,
  mockListCameras,
} from "@/modules/supervisor-cav/services/camerasService.mock";
import {
  cavApi,
  getAuthHeaders,
  handleUnauthorized,
  isCavMock,
} from "@/modules/supervisor-cav/services/cavApi";
import type {
  CamerasOverview,
  LiveSession,
} from "@/modules/supervisor-cav/types/Camera";

/**
 * Endpoints del backend (módulo `video-surveillance`):
 *
 *   GET  /cameras                            cámaras por edificio
 *   POST /cameras/:cameraId/live-sessions    { requestId }  una visualización registrada
 *
 * El video no pasa por el backend: el navegador lo negocia con `whepUrl`.
 */
export const listCameras = async (): Promise<CamerasOverview> => {
  if (isCavMock) return mockListCameras();

  try {
    const { data } = await cavApi.get<{ data: CamerasOverview }>("/cameras", {
      headers: getAuthHeaders(),
    });
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Un `requestId` nuevo por clic: cada sesión queda registrada como una visualización. */
export const createLiveSession = async (
  cameraId: string,
  requestId: string,
): Promise<LiveSession> => {
  if (isCavMock) return mockCreateLiveSession(cameraId, requestId);

  try {
    const { data } = await cavApi.post<{ data: LiveSession }>(
      `/cameras/${encodeURIComponent(cameraId)}/live-sessions`,
      { requestId },
      { headers: getAuthHeaders() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
