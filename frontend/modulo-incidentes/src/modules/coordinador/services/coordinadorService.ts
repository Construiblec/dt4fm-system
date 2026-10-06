import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";
import { redirectToLogin } from "@/shared/auth/returnTo";
import type {
  AssignPendingTaskPayload,
  ChecklistTemplate,
  CleaningEmployee,
  CreateChecklistTemplatePayload,
  CreateManualTaskPayload,
  GetCheckoutsResponse,
  SyncResult,
} from "@/modules/coordinador/types/Coordinador";

const coordinadorApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(coordinadorApi, "x-session-token");

function getAuthHeaders() {
  return {
    "x-session-token": localStorage.getItem("sessionId") ?? "",
    "x-role": localStorage.getItem("role") ?? "",
  };
}

function handleUnauthorized(error: unknown): never {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    redirectToLogin();
  }
  throw error;
}

// ─── Sincronización con Hostaway ──────────────────────────────────────────

export const fetchUpcomingCleanings = async (
  dateFrom: string,
  dateTo: string,
): Promise<GetCheckoutsResponse> => {
  try {
    const { data } = await coordinadorApi.get<GetCheckoutsResponse>(
      `/cleaning-tasks/checkouts?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const syncToday = async (): Promise<SyncResult> => {
  try {
    const { data } = await coordinadorApi.post<SyncResult>(
      "/cleaning-tasks/sync/today",
      {},
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Asignación de pendientes / creación manual ───────────────────────────

export const assignPendingTask = async (
  taskId: number,
  payload: AssignPendingTaskPayload,
): Promise<{ updated: boolean; taskId: number }> => {
  try {
    const { data } = await coordinadorApi.put<{
      updated: boolean;
      taskId: number;
    }>(`/cleaning-tasks/${taskId}`, payload, { headers: getAuthHeaders() });
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const createManualTask = async (
  payload: CreateManualTaskPayload,
): Promise<{ created: boolean; taskId: number | null; taskNumber: string | null }> => {
  try {
    const { data } = await coordinadorApi.post<{
      created: boolean;
      taskId: number | null;
      taskNumber: string | null;
    }>("/cleaning-tasks/manual", payload, { headers: getAuthHeaders() });
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Checklists ────────────────────────────────────────────────────────────

export const fetchChecklistTemplates = async (): Promise<ChecklistTemplate[]> => {
  try {
    const { data } = await coordinadorApi.get<{ data: ChecklistTemplate[] }>(
      "/cleaning-tasks/checklists",
      { headers: getAuthHeaders() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const createChecklistTemplate = async (
  payload: CreateChecklistTemplatePayload,
): Promise<{ created: boolean; id: number | null }> => {
  try {
    const { data } = await coordinadorApi.post<{
      created: boolean;
      id: number | null;
    }>("/cleaning-tasks/checklists", payload, { headers: getAuthHeaders() });
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

// ─── Empleados de limpieza ─────────────────────────────────────────────────

export const fetchCleaningEmployees = async (): Promise<CleaningEmployee[]> => {
  try {
    const { data } = await coordinadorApi.get<{ data: CleaningEmployee[] }>(
      "/cleaning-tasks/employees",
      { headers: getAuthHeaders() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
