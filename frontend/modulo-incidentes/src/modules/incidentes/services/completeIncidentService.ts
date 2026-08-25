import { env } from "@/config/env";
import { redirectToLogin } from "@/shared/auth/returnTo";

// `VITE_API_URL` termina en `/api`, pero el backend no declara prefijo global:
// sus rutas cuelgan de la raíz. Sin recortarlo se pide `/api/incidents/...` y
// responde 404, igual que hacen el resto de servicios.
const incidentsBaseUrl = env.VITE_API_URL.replace(/\/api\/?$/, "");

type CompleteIncidentResponse = {
  success: boolean;
  message: string;
};

type StartIncidentResponse = {
  success: boolean;
  /** `true` si ya estaba en marcha; entonces se conserva el inicio original. */
  alreadyStarted: boolean;
  statusCode: string | null;
  execStartDate: string;
  message: string;
};

/**
 * Sella el inicio real del trabajo (`ExecStartDate`) en OpenMAINT.
 *
 * Es lo que mueve el correctivo de «Asignado» a «Ejecución»: hasta que el
 * técnico no pulsa «Iniciar» no hay fecha de inicio, y sin ella el trabajo no
 * se puede finalizar.
 */
export const startIncident = async (
  id: number,
): Promise<StartIncidentResponse> => {
  const sessionId = localStorage.getItem("sessionId");

  const response = await fetch(`${incidentsBaseUrl}/incidents/${id}/start`, {
    method: "POST",
    headers: {
      Authorization: sessionId ?? "",
    },
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("No se pudo iniciar el trabajo");
  }

  return (await response.json()) as StartIncidentResponse;
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
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error("No se pudo completar el incidente");
  }

  return (await response.json()) as CompleteIncidentResponse;
};
