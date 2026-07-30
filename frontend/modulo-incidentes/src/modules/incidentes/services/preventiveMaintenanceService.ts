import axios from "axios";
import { env } from "@/config/env";
import type {
  ChecklistAnswer,
  PreventiveChecklistItem,
} from "@/modules/incidentes/types/PreventiveChecklist";
import type {
  PreventiveMaintenance,
  PreventiveMaintenanceDetail,
} from "@/modules/incidentes/types/PreventiveMaintenance";

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

const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
  "x-employee-id": localStorage.getItem("employeeId") ?? "",
});

/** Redirige al login cuando la sesión de OpenMAINT ya no es válida. */
const handleUnauthorized = (error: unknown): never => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    window.location.assign("/login");
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

/**
 * Abre el mantenimiento: si estaba en Asignación pasa a Ejecución también en
 * OpenMAINT. Es idempotente, así que sirve como carga del detalle.
 */
export const startPreventiveMaintenance = async (
  id: string,
): Promise<PreventiveMaintenanceDetail> => {
  try {
    const { data } = await preventiveMaintenanceApi.post<DetailResponse>(
      `/preventive-maintenance/${id}/start`,
      null,
      { headers: getAuthHeaders() },
    );

    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
