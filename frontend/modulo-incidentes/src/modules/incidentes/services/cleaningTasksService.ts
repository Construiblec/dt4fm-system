import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";
import type {
  CleaningTask,
  GetMyCleaningTasksResponse,
} from "@/modules/incidentes/types/CleaningTask";
import { redirectToLogin } from "@/shared/auth/returnTo";

const cleaningApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(cleaningApi, "x-session-token");

/**
 * Las limpiezas del operario, las recién creadas primero. El dashboard las
 * filtra por día en el navegador, así que el límite tiene que cubrir de sobra
 * las de hoy: sin orden, openMAINT podía dejarlas fuera con el corte de 50.
 */
export const fetchMyCleaningTasks = async (): Promise<CleaningTask[]> => {
  const sessionId = localStorage.getItem("sessionId");
  const cleaningEmployeeId = localStorage.getItem("cleaningEmployeeId");

  try {
    const { data } = await cleaningApi.get<GetMyCleaningTasksResponse>(
      "/cleaning-tasks/mine",
      {
        params: { limit: 200, sort: "newest" },
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
