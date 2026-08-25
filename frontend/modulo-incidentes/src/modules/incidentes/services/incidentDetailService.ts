import { env } from "@/config/env";
import type { IncidentDetail } from "@/modules/incidentes/types/IncidentDetail";
import { redirectToLogin } from "@/shared/auth/returnTo";

const incidentsBaseUrl = env.VITE_API_URL.replace(/\/api\/?$/, "");

export const getIncidentById = async (id: string): Promise<IncidentDetail> => {
  const sessionId = localStorage.getItem("sessionId");

  const response = await fetch(`${incidentsBaseUrl}/incidents/${id}`, {
    method: "GET",
    headers: {
      Authorization: sessionId ?? "",
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("No se pudo obtener el incidente");
  }

  return (await response.json()) as IncidentDetail;
};
