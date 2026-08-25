import axios from "axios";
import { env } from "@/config/env";
import type {
  AssigneesResponse,
  AssignPayload,
  EvidenceResponse,
  ListParams,
  ListResponse,
  MaintenanceKind,
  MaintenanceResponse,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * El backend gatea por `x-role`, pero la barrera real son los permisos de
 * grupo de la sesión en openMAINT: este header solo evita llamadas de un rol
 * equivocado.
 */
const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
  "x-role": localStorage.getItem("role") ?? "",
});

/** Redirige al login cuando la sesión de openMAINT ya no es válida. */
const handleUnauthorized = (error: unknown): never => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    window.location.assign("/login");
  }

  throw error;
};

/** Mensaje que el backend devolvió, para poder mostrarlo tal cual en la UI. */
export const getApiErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;

    if (Array.isArray(message)) return message.join(". ");
    if (typeof message === "string") return message;
  }

  return fallback;
};

const buildQuery = ({
  status,
  assigned,
  limit = 10,
  offset = 0,
  from,
  to,
}: ListParams) => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) params.set("status", status);
  if (assigned !== undefined) params.set("assigned", String(assigned));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
};

export const listMaintenances = async (
  kind: MaintenanceKind,
  params: ListParams = {},
): Promise<ListResponse> => {
  try {
    const { data } = await api.get<ListResponse>(
      `/maintenance-supervision/${kind}?${buildQuery(params)}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Detalle en solo lectura. Endpoint propio a propósito: la vista del técnico
 * usa `POST /preventive-maintenance/:id/start`, que **avanza el flujo**.
 */
export const getMaintenanceDetail = async (
  kind: MaintenanceKind,
  id: number,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.get<MaintenanceResponse>(
      `/maintenance-supervision/${kind}/${id}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Fotos de evidencia. Llegan ya en base64 desde el backend, así que se pintan
 * directamente sin pasar la sesión de OpenMAINT al navegador.
 */
export const getMaintenanceEvidence = async (
  kind: MaintenanceKind,
  id: number,
): Promise<EvidenceResponse> => {
  try {
    const { data } = await api.get<EvidenceResponse>(
      `/maintenance-supervision/${kind}/${id}/attachments`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const listAssignees = async (
  teamId?: number,
): Promise<AssigneesResponse> => {
  const query = teamId !== undefined ? `?teamId=${teamId}` : "";

  try {
    const { data } = await api.get<AssigneesResponse>(
      `/maintenance-supervision/assignees${query}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const assignMaintenance = async (
  kind: MaintenanceKind,
  id: number,
  payload: AssignPayload,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.post<MaintenanceResponse>(
      `/maintenance-supervision/${kind}/${id}/assign`,
      payload,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Solo preventivo: devuelve a ejecución uno suspendido (`PM04-Advance`).
 * OpenMAINT limpia el motivo de suspensión por su cuenta.
 */
export const resumePreventive = async (
  id: number,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.post<MaintenanceResponse>(
      `/maintenance-supervision/preventive/${id}/resume`,
      {},
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Solo correctivo: el preventivo no tiene rama de rechazo en asignación. */
export const rejectCorrective = async (
  id: number,
  notes: string,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.post<MaintenanceResponse>(
      `/maintenance-supervision/corrective/${id}/reject`,
      { notes },
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * `teamId` solo se manda cuando el paso admite cambiar de equipo; el backend lo
 * ignora y lo registra en el log en los demás casos.
 */
export const updateAssignee = async (
  kind: MaintenanceKind,
  id: number,
  assigneeId: number,
  teamId?: number,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.put<MaintenanceResponse>(
      `/maintenance-supervision/${kind}/${id}/assignee`,
      { assigneeId, ...(teamId !== undefined ? { teamId } : {}) },
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Aprueba o devuelve un correctivo pendiente de revisión. No hay equivalente
 * en preventivo: `PM03-Advance` cierra el proceso y un proceso cerrado ya no
 * admite acciones.
 */
export const reviewCorrective = async (
  id: number,
  approved: boolean,
  notes?: string,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.post<MaintenanceResponse>(
      `/maintenance-supervision/corrective/${id}/review`,
      { approved, notes },
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const updatePlannedStart = async (
  kind: MaintenanceKind,
  id: number,
  plannedStart: string,
): Promise<MaintenanceResponse> => {
  try {
    const { data } = await api.put<MaintenanceResponse>(
      `/maintenance-supervision/${kind}/${id}/planned-start`,
      { plannedStart },
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
