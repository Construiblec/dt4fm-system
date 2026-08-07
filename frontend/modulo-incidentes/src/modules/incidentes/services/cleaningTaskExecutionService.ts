import axios from "axios";
import { env } from "@/config/env";
import type {
  CleaningTaskAttachment,
  CleaningTaskCompleteResponse,
  CleaningTaskDetailResponse,
  CleaningTaskExecutionDetail,
  CleaningTaskStartResponse,
  CleaningTaskUploadResponse,
} from "@/modules/incidentes/types/CleaningTaskExecution";

const cleaningExecutionApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

const getCleaningHeaders = () => ({
  "x-session-token": localStorage.getItem("sessionId") ?? "",
  "x-cleaning-employee-id": localStorage.getItem("cleaningEmployeeId") ?? "",
});

const redirectIfUnauthorized = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    window.location.assign("/login");
  }
};

const extractDetailPayload = (
  response:
    | CleaningTaskStartResponse
    | CleaningTaskDetailResponse
    | CleaningTaskExecutionDetail,
): CleaningTaskExecutionDetail => {
  if ("data" in response && response.data) {
    return response.data;
  }

  return response as CleaningTaskExecutionDetail;
};

export const getAttachmentUrl = (attachment?: CleaningTaskAttachment | null) =>
  attachment?.url ??
  attachment?.fileUrl ??
  attachment?.path ??
  attachment?.downloadUrl;

export const startCleaningTask = async (
  taskId: number,
): Promise<CleaningTaskExecutionDetail> => {
  try {
    const { data } = await cleaningExecutionApi.patch<CleaningTaskStartResponse>(
      `/cleaning-tasks/${taskId}/start`,
      undefined,
      {
        headers: getCleaningHeaders(),
      },
    );

    return extractDetailPayload(data);
  } catch (error) {
    redirectIfUnauthorized(error);
    throw error;
  }
};

export const getCleaningTaskDetail = async (
  taskId: number,
): Promise<CleaningTaskExecutionDetail> => {
  try {
    const { data } = await cleaningExecutionApi.get<CleaningTaskDetailResponse>(
      `/cleaning-tasks/${taskId}`,
      {
        headers: getCleaningHeaders(),
      },
    );

    return extractDetailPayload(data);
  } catch (error) {
    redirectIfUnauthorized(error);
    throw error;
  }
};

export const uploadCleaningTaskPhoto = async (
  taskId: number,
  file: File,
): Promise<string | undefined> => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", "Photo");
  formData.append("description", `Evidencia de limpieza ${file.name}`);

  try {
    const { data } = await cleaningExecutionApi.post<CleaningTaskUploadResponse>(
      `/cleaning-tasks/${taskId}/attachments`,
      formData,
      {
        headers: {
          ...getCleaningHeaders(),
          "Content-Type": "multipart/form-data",
        },
      },
    );

    const url =
      data.data?.url ??
      data.data?.fileUrl ??
      data.data?.path ??
      data.url ??
      data.fileUrl ??
      data.path;

    return url;
  } catch (error) {
    redirectIfUnauthorized(error);
    throw error;
  }
};

export const completeCleaningTask = async (
  taskId: number,
  observations: string,
  executionMinutes?: number,
): Promise<CleaningTaskCompleteResponse> => {
  try {
    const { data } = await cleaningExecutionApi.patch<CleaningTaskCompleteResponse>(
      `/cleaning-tasks/${taskId}/complete`,
      {
        observations,
        executionMinutes,
      },
      {
        headers: {
          ...getCleaningHeaders(),
          "Content-Type": "application/json",
        },
      },
    );

    return data;
  } catch (error) {
    redirectIfUnauthorized(error);
    throw error;
  }
};
