import axios from "axios";
import { env } from "@/config/env";
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
