import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";
import { redirectToLogin } from "@/shared/auth/returnTo";
import type {
  ApiEnvelope,
  CleaningEmployee,
  FindingInput,
  MyCorrection,
  SupervisionDetail,
  SupervisionFinding,
  SupervisionPhoto,
  SupervisionTemplate,
} from "@/modules/supervisor/types/Supervision";

/**
 * Cliente de `/cleaning-supervisions`. Solo manda `x-session-token`: el rol y
 * el empleado los resuelve el backend desde la sesión, nunca desde cabeceras
 * que arma el navegador.
 */
const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(api, "x-session-token");

const headers = () => ({
  "x-session-token": localStorage.getItem("sessionId") ?? "",
});

const call = async <T>(request: () => Promise<{ data: T }>): Promise<T> => {
  try {
    return (await request()).data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      redirectToLogin();
    }
    throw error;
  }
};

/** Mensaje en español del backend (400/403/404/409) o el genérico. */
export const describeSupervisionError = (
  error: unknown,
  fallback: string,
): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === "string" && message.trim()) return message;
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0];
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

/** `reason` del 409 al abrir una limpieza que no se supervisa. */
export const unavailableReasonOf = (error: unknown): string | null =>
  axios.isAxiosError(error) && error.response?.status === 409
    ? (error.response.data?.reason ?? null)
    : null;

export const fetchSupervisionTemplate = () =>
  call(() =>
    api.get<ApiEnvelope<SupervisionTemplate>>(
      "/cleaning-supervisions/template",
      { headers: headers() },
    ),
  );

/** Devuelve la supervisión abierta de la limpieza o recupera su borrador. */
export const openSupervisionForTask = (taskId: number) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionDetail>>(
      "/cleaning-supervisions",
      { taskId },
      { headers: headers() },
    ),
  );

export const fetchSupervision = (id: number) =>
  call(() =>
    api.get<ApiEnvelope<SupervisionDetail>>(`/cleaning-supervisions/${id}`, {
      headers: headers(),
    }),
  );

export const startSupervision = (id: number) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionDetail>>(
      `/cleaning-supervisions/${id}/start`,
      {},
      { headers: headers() },
    ),
  );

export const createFinding = (id: number, input: FindingInput) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionFinding>>(
      `/cleaning-supervisions/${id}/findings`,
      input,
      { headers: headers() },
    ),
  );

export const updateFinding = (
  id: number,
  findingId: number,
  input: Partial<FindingInput>,
) =>
  call(() =>
    api.patch<ApiEnvelope<SupervisionFinding>>(
      `/cleaning-supervisions/${id}/findings/${findingId}`,
      input,
      { headers: headers() },
    ),
  );

export const deleteFinding = (id: number, findingId: number) =>
  call(() =>
    api.delete(`/cleaning-supervisions/${id}/findings/${findingId}`, {
      headers: headers(),
    }),
  );

export const uploadFindingPhoto = (id: number, findingId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return call(() =>
    api.post<ApiEnvelope<SupervisionPhoto>>(
      `/cleaning-supervisions/${id}/findings/${findingId}/photos`,
      formData,
      { headers: { ...headers(), "Content-Type": "multipart/form-data" } },
    ),
  );
};

export const deleteFindingPhoto = (
  id: number,
  findingId: number,
  attachmentId: string,
) =>
  call(() =>
    api.delete(
      `/cleaning-supervisions/${id}/findings/${findingId}/photos/${encodeURIComponent(attachmentId)}`,
      { headers: headers() },
    ),
  );

/** Foto del arreglo: la sube el Corrector mientras la supervisión está en corrección. */
export const uploadFixPhoto = (id: number, findingId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return call(() =>
    api.post<ApiEnvelope<SupervisionPhoto>>(
      `/cleaning-supervisions/${id}/findings/${findingId}/fix-photos`,
      formData,
      { headers: { ...headers(), "Content-Type": "multipart/form-data" } },
    ),
  );
};

export const deleteFixPhoto = (
  id: number,
  findingId: number,
  attachmentId: string,
) =>
  call(() =>
    api.delete(
      `/cleaning-supervisions/${id}/findings/${findingId}/fix-photos/${encodeURIComponent(attachmentId)}`,
      { headers: headers() },
    ),
  );

export const assignCorrector = (id: number, employeeId: number) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionDetail>>(
      `/cleaning-supervisions/${id}/assign`,
      { employeeId },
      { headers: headers() },
    ),
  );

export const confirmSupervision = (id: number) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionDetail>>(
      `/cleaning-supervisions/${id}/confirm`,
      {},
      { headers: headers() },
    ),
  );

export const approveSupervision = (id: number) =>
  call(() =>
    api.post<ApiEnvelope<SupervisionDetail>>(
      `/cleaning-supervisions/${id}/approve`,
      {},
      { headers: headers() },
    ),
  );

// ─── Operario ────────────────────────────────────────────────────────────────

/** Las correcciones que el supervisor le asignó al operario conectado. */
export const fetchMyCorrections = () =>
  call(() =>
    api.get<ApiEnvelope<MyCorrection[]>>("/cleaning-supervisions/mine", {
      headers: headers(),
    }),
  );

/** «Resuelto»: la supervisión pasa a `Fixed` y se avisa al supervisor. */
export const markCorrectionsFixed = (id: number) =>
  call(() =>
    api.post<ApiEnvelope<{ id: number; phase: string }>>(
      `/cleaning-supervisions/${id}/fixed`,
      {},
      { headers: headers() },
    ),
  );

/** Operarios del equipo de limpieza (el mismo endpoint que usa la coordinación). */
export const fetchCleaningEmployees = () =>
  call(() =>
    api.get<ApiEnvelope<CleaningEmployee[]>>("/cleaning-tasks/employees", {
      headers: headers(),
    }),
  );
