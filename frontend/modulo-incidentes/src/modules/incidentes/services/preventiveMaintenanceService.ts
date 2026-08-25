import axios from "axios";
import { env } from "@/config/env";
import type {
  ChecklistAnswer,
  PreventiveChecklistItem,
} from "@/modules/incidentes/types/PreventiveChecklist";
import type {
  PreventiveMaintenance,
  PreventiveMaintenanceAttachment,
  PreventiveMaintenanceDetail,
  PreventiveMaintenanceHistoryEntry,
  SuspensionReason,
} from "@/modules/incidentes/types/PreventiveMaintenance";
import { redirectToLogin } from "@/shared/auth/returnTo";

const preventiveMaintenanceApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

type ListResponse = {
  success: boolean;
  data: PreventiveMaintenance[];
  meta: { total: number; limit: number; offset: number };
};

type DetailResponse = {
  success: boolean;
  data: PreventiveMaintenanceDetail;
};

type ChecklistResponse = {
  success: boolean;
  data: { checklist: PreventiveChecklistItem[] };
};

type SuspensionReasonsResponse = {
  success: boolean;
  data: SuspensionReason[];
};

type HistoryResponse = {
  success: boolean;
  data: PreventiveMaintenanceHistoryEntry[];
  meta: { total: number; equipment: string | null };
};

type AttachmentsResponse = {
  success: boolean;
  data: PreventiveMaintenanceAttachment[];
  meta: { total: number };
};

const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
  "x-employee-id": localStorage.getItem("employeeId") ?? "",
});

/** Redirige al login cuando la sesión de OpenMAINT ya no es válida. */
const handleUnauthorized = (error: unknown): never => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    redirectToLogin();
  }

  throw error;
};

export const getMyPreventiveMaintenances = async (): Promise<
  PreventiveMaintenance[]
> => {
  try {
    const { data } = await preventiveMaintenanceApi.get<ListResponse>(
      "/preventive-maintenance/my",
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const getPreventiveMaintenanceById = async (
  id: string,
): Promise<PreventiveMaintenanceDetail> => {
  try {
    const { data } = await preventiveMaintenanceApi.get<DetailResponse>(
      `/preventive-maintenance/${id}`,
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Mantenimientos ya completados sobre el mismo equipo, del más reciente al más antiguo. */
export const getPreventiveMaintenanceHistory = async (
  id: string,
  limit: number,
): Promise<PreventiveMaintenanceHistoryEntry[]> => {
  try {
    const { data } = await preventiveMaintenanceApi.get<HistoryResponse>(
      `/preventive-maintenance/${id}/history`,
      { headers: getAuthHeaders(), params: { limit } },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Documentación del equipo: los archivos del manual de mantenimiento al que
 * apunta el plan preventivo.
 */
export const getPreventiveMaintenanceDocuments = async (
  id: string,
): Promise<PreventiveMaintenanceAttachment[]> => {
  try {
    const { data } = await preventiveMaintenanceApi.get<AttachmentsResponse>(
      `/preventive-maintenance/${id}/documents`,
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Archivos adjuntos del mantenimiento, incluido el informe que genera al cerrar. */
export const getPreventiveMaintenanceAttachments = async (
  id: string,
): Promise<PreventiveMaintenanceAttachment[]> => {
  try {
    const { data } = await preventiveMaintenanceApi.get<AttachmentsResponse>(
      `/preventive-maintenance/${id}/attachments`,
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Adjunta un documento a la tarjeta del mantenimiento y devuelve la lista de
 * adjuntos ya actualizada.
 */
export const uploadPreventiveMaintenanceDocument = async (
  id: string,
  file: File,
): Promise<PreventiveMaintenanceAttachment[]> => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const { data } = await preventiveMaintenanceApi.post<AttachmentsResponse>(
      `/preventive-maintenance/${id}/attachments`,
      formData,
      {
        headers: { ...getAuthHeaders(), "Content-Type": "multipart/form-data" },
      },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Quita un documento adjunto y devuelve la lista actualizada. Solo se permite
 * mientras el mantenimiento siga abierto.
 */
export const deletePreventiveMaintenanceDocument = async (
  id: string,
  attachmentId: string,
): Promise<PreventiveMaintenanceAttachment[]> => {
  try {
    const { data } = await preventiveMaintenanceApi.delete<AttachmentsResponse>(
      `/preventive-maintenance/${id}/attachments/${attachmentId}`,
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Guarda las respuestas del checklist y devuelve su estado actualizado. */
export const savePreventiveChecklist = async (
  id: string,
  items: ChecklistAnswer[],
): Promise<PreventiveChecklistItem[]> => {
  try {
    const { data } = await preventiveMaintenanceApi.put<ChecklistResponse>(
      `/preventive-maintenance/${id}/checklist`,
      { items },
      { headers: getAuthHeaders() },
    );

    return data.data.checklist;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Finaliza el mantenimiento. OpenMAINT solo lo permite con el checklist
 * completo, así que hay que guardarlo antes.
 */
export const completePreventiveMaintenance = async (
  id: string,
  notes: string,
): Promise<void> => {
  const formData = new FormData();
  formData.append("notes", notes);

  try {
    await preventiveMaintenanceApi.post(
      `/preventive-maintenance/${id}/complete`,
      formData,
      {
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "multipart/form-data",
        },
      },
    );
  } catch (error) {
    handleUnauthorized(error);
  }
};

export const getSuspensionReasons = async (): Promise<SuspensionReason[]> => {
  try {
    const { data } =
      await preventiveMaintenanceApi.get<SuspensionReasonsResponse>(
        "/preventive-maintenance/suspension-reasons",
        { headers: getAuthHeaders() },
      );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/**
 * Suspende el mantenimiento. Las respuestas del checklist viajan en la misma
 * petición: el backend las guarda y marca como N.D. las que sigan sin resolver.
 */
export const suspendPreventiveMaintenance = async (
  id: string,
  input: { reasonId: string; notes: string; items: ChecklistAnswer[] },
): Promise<void> => {
  try {
    await preventiveMaintenanceApi.post(
      `/preventive-maintenance/${id}/suspend`,
      {
        reasonId: Number(input.reasonId),
        notes: input.notes,
        items: input.items,
      },
      { headers: getAuthHeaders() },
    );
  } catch (error) {
    handleUnauthorized(error);
  }
};

/**
 * Aperturas en curso. Abrir avanza el flujo en OpenMAINT, que bloquea el
 * proceso: dos peticiones a la vez compiten por ese bloqueo y una falla, así
 * que la segunda se engancha a la primera. Ocurre con `StrictMode` y con un
 * doble toque.
 */
const startRequests = new Map<string, Promise<PreventiveMaintenanceDetail>>();

/**
 * Abre el mantenimiento: si estaba en Asignación pasa a Ejecución también en
 * OpenMAINT. Es idempotente, así que sirve como carga del detalle.
 */
export const startPreventiveMaintenance = (
  id: string,
): Promise<PreventiveMaintenanceDetail> => {
  const inFlight = startRequests.get(id);

  if (inFlight) {
    return inFlight;
  }

  const request = preventiveMaintenanceApi
    .post<DetailResponse>(`/preventive-maintenance/${id}/start`, null, {
      headers: getAuthHeaders(),
    })
    .then(({ data }) => data.data)
    .catch(handleUnauthorized)
    .finally(() => startRequests.delete(id));

  startRequests.set(id, request);

  return request;
};
