import { env } from "@/config/env";

const incidentsBaseUrl = env.VITE_API_URL.replace(/\/$/, "");

type CompleteIncidentResponse = {
  success: boolean;
  message: string;
};

export const completeIncident = async (
  id: number,
  notes?: string,
  file?: File | null,
): Promise<CompleteIncidentResponse> => {
  const sessionId = localStorage.getItem("sessionId");
  const formData = new FormData();

  if (notes?.trim()) {
    formData.append("notes", notes.trim());
  }

  if (file) {
    formData.append("file", file);
  }

  const response = await fetch(`${incidentsBaseUrl}/incidents/${id}/complete`, {
    method: "POST",
    headers: {
      Authorization: sessionId ?? "",
    },
    body: formData,
  });

  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("No se pudo completar el incidente");
  }

  return (await response.json()) as CompleteIncidentResponse;
};
