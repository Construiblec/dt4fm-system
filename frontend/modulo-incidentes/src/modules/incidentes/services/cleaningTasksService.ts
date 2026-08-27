import axios from "axios";
import { env } from "@/config/env";
import type {
  CleaningTask,
  GetMyCleaningTasksResponse,
} from "@/modules/incidentes/types/CleaningTask";
import { redirectToLogin } from "@/shared/auth/returnTo";

const cleaningApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

export const fetchMyCleaningTasks = async (): Promise<CleaningTask[]> => {
  const sessionId = localStorage.getItem("sessionId");
  const cleaningEmployeeId = localStorage.getItem("cleaningEmployeeId");

  try {
    const { data } = await cleaningApi.get<GetMyCleaningTasksResponse>(
      "/cleaning-tasks/mine",
      {
        headers: {
          "x-session-token": sessionId ?? "",
          "x-cleaning-employee-id": cleaningEmployeeId ?? "",
        },
      },
    );

    return data.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      redirectToLogin();
    }

    throw error;
  }
};
