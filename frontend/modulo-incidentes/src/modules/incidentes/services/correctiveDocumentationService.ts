import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";
import { redirectToLogin } from "@/shared/auth/returnTo";
import { downscaleImage } from "@/shared/utils/downscaleImage";
import type {
  CorrectiveEquipment,
  EquipmentHistoryEntry,
  MaintenanceAttachment,
} from "@/modules/incidentes/types/CorrectiveDocumentation";

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(api, "authorization");

type ListResponse<T> = {
  success: boolean;
  data: T[];
  meta: { total: number; equipment?: CorrectiveEquipment | null };
};

const headers = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
});

const handleUnauthorized = (error: unknown): never => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    redirectToLogin();
  }

  throw error;
};

export const getCorrectiveAttachments = async (
  id: string,
): Promise<MaintenanceAttachment[]> => {
  try {
    const { data } = await api.get<ListResponse<MaintenanceAttachment>>(
      `/corrective-maintenance/${id}/attachments`,
      { headers: headers() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Sube un documento o una foto y devuelve la lista ya actualizada. */
export const uploadCorrectiveAttachment = async (
  id: string,
  file: File,
): Promise<MaintenanceAttachment[]> => {
  const formData = new FormData();
  formData.append("file", await downscaleImage(file));

  try {
    const { data } = await api.post<ListResponse<MaintenanceAttachment>>(
      `/corrective-maintenance/${id}/attachments`,
      formData,
      { headers: { ...headers(), "Content-Type": "multipart/form-data" } },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const deleteCorrectiveAttachment = async (
  id: string,
  attachmentId: string,
): Promise<MaintenanceAttachment[]> => {
  try {
    const { data } = await api.delete<ListResponse<MaintenanceAttachment>>(
      `/corrective-maintenance/${id}/attachments/${attachmentId}`,
      { headers: headers() },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const getCorrectiveEquipmentDocuments = async (
  id: string,
): Promise<{
  documents: MaintenanceAttachment[];
  equipment: CorrectiveEquipment | null;
}> => {
  try {
    const { data } = await api.get<ListResponse<MaintenanceAttachment>>(
      `/corrective-maintenance/${id}/documents`,
      { headers: headers() },
    );
    return { documents: data.data, equipment: data.meta.equipment ?? null };
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const getCorrectiveEquipmentHistory = async (
  id: string,
  limit = 3,
): Promise<EquipmentHistoryEntry[]> => {
  try {
    const { data } = await api.get<ListResponse<EquipmentHistoryEntry>>(
      `/corrective-maintenance/${id}/history`,
      { headers: headers(), params: { limit } },
    );
    return data.data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
