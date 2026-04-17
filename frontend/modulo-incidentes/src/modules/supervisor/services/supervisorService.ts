import axios from "axios";
import { env } from "@/config/env";
import type {
  GetAllCleaningTasksParams,
  GetAllCleaningTasksResponse,
  GetTaskAttachmentsResponse,
  GetTaskDetailResponse,
  ReopenTaskPayload,
  ReopenTaskResponse,
  ReviewTaskPayload,
  ReviewTaskResponse,
} from "@/modules/supervisor/types/SupervisorTask";

const supervisorApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

function getAuthHeaders() {
  return {
    "x-session-token": localStorage.getItem("sessionId") ?? "",
    "x-role": localStorage.getItem("role") ?? "",
  };
}

function handleUnauthorized(error: unknown): never {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    window.location.assign("/login");
  }
  throw error;
}

// ─── Lista de todas las tareas ────────────────────────────────────────────────

export const fetchAllCleaningTasks = async (
  params: GetAllCleaningTasksParams = {},
): Promise<GetAllCleaningTasksResponse> => {
  const { phase, date, employeeId, limit = 50, offset = 0 } = params;

  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(limit));
  queryParams.set("offset", String(offset));
  if (phase) queryParams.set("phase", phase);
  if (date) queryParams.set("date", date);
  if (employeeId) queryParams.set("employeeId", String(employeeId));

  try {
    const { data } = await supervisorApi.get<GetAllCleaningTasksResponse>(
      `/cleaning-tasks/all?${queryParams.toString()}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Detalle de una tarea ─────────────────────────────────────────────────────

export const fetchTaskDetail = async (
  taskId: number,
): Promise<GetTaskDetailResponse> => {
  try {
    const { data } = await supervisorApi.get<GetTaskDetailResponse>(
      `/cleaning-tasks/${taskId}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Attachments de una tarea ─────────────────────────────────────────────────

export const fetchTaskAttachments = async (
  taskId: number,
): Promise<GetTaskAttachmentsResponse> => {
  try {
    const { data } = await supervisorApi.get<GetTaskAttachmentsResponse>(
      `/cleaning-tasks/${taskId}/attachments`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Devuelve la URL completa para visualizar un attachment directamente en <img src>.
 * Usa ?token= como query param porque <img> no puede enviar headers.
 */
export const getAttachmentUrl = (downloadUrl: string): string => {
  const base = env.VITE_API_URL.replace(/\/api\/?$/, "");
  const token = localStorage.getItem("sessionId") ?? "";
  return `${base}${downloadUrl}?token=${encodeURIComponent(token)}`;
};

// ─── Reabrir una tarea ───────────────────────────────────────────────────────

export const reopenCleaningTask = async (
  taskId: number,
  payload: ReopenTaskPayload,
): Promise<ReopenTaskResponse> => {
  try {
    const { data } = await supervisorApi.patch<ReopenTaskResponse>(
      `/cleaning-tasks/${taskId}/reopen`,
      payload,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Revisar una tarea ────────────────────────────────────────────────────────

export const reviewCleaningTask = async (
  taskId: number,
  payload: ReviewTaskPayload,
): Promise<ReviewTaskResponse> => {
  try {
    const { data } = await supervisorApi.patch<ReviewTaskResponse>(
      `/cleaning-tasks/${taskId}/review`,
      payload,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
