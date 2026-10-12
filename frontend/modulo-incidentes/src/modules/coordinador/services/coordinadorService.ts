import axios from "axios";
import { env } from "@/config/env";
import { attachSessionRenewal } from "@/shared/auth/sessionHttp";
import { redirectToLogin } from "@/shared/auth/returnTo";
import type {
  Checklist,
  CheckoutPreview,
  CheckoutRow,
  CoordTask,
  CoordTaskDetail,
  CreateManualTaskPayload,
  EmployeeOption,
  SaveChecklistPayload,
  SyncResult,
  UpdateTaskPayload,
} from "../types/Coordinador";

const coordApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

attachSessionRenewal(coordApi, "x-session-token");

const authHeaders = () => ({
  "x-session-token": localStorage.getItem("sessionId") ?? "",
});

/** Un 401 manda al login; cualquier otro error llega a la pantalla para que lo explique. */
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

/** El mensaje del backend, o `fallback`. Nunca el texto técnico de axios. */
export const describeApiError = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const message: unknown = error.response?.data?.message;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length) return message.join(". ");
    if (!error.response) return "No hay conexión con el servidor.";
  }
  return fallback;
};

// ─── Limpiezas ──────────────────────────────────────────────────────────────

/** Todas las limpiezas, las recién creadas primero. */
export const fetchAllTasks = async (): Promise<CoordTask[]> => {
  const body = await call(() =>
    coordApi.get<{ data: CoordTask[] }>("/cleaning-tasks/all", {
      params: { sort: "newest", limit: 500 },
      headers: authHeaders(),
    }),
  );
  return body.data;
};

export const fetchTaskDetail = async (id: number): Promise<CoordTaskDetail> => {
  const body = await call(() =>
    coordApi.get<{ data: CoordTaskDetail }>(`/cleaning-tasks/${id}`, {
      headers: authHeaders(),
    }),
  );
  return body.data;
};

export const updateTask = (id: number, payload: UpdateTaskPayload) =>
  call(() =>
    coordApi.put<{ updated: boolean; taskId: number; notified: number | null }>(
      `/cleaning-tasks/${id}`,
      payload,
      { headers: authHeaders() },
    ),
  );

export const cancelTask = (id: number, reason: string) =>
  call(() =>
    coordApi.patch(
      `/cleaning-tasks/${id}/cancel`,
      { reason },
      { headers: authHeaders() },
    ),
  );

export const createManualTask = (payload: CreateManualTaskPayload) =>
  call(() =>
    coordApi.post<{
      created: boolean;
      taskId: number | null;
      taskNumber: string;
      notified: number | null;
    }>("/cleaning-tasks/manual", payload, { headers: authHeaders() }),
  );

// ─── Sincronización con Hostaway ────────────────────────────────────────────

export const fetchCheckoutPreview = (
  dateFrom: string,
  dateTo: string,
): Promise<CheckoutPreview> =>
  call(() =>
    coordApi.get<CheckoutPreview>("/cleaning-tasks/checkouts/preview", {
      params: { dateFrom, dateTo },
      headers: authHeaders(),
    }),
  );

export const syncRange = (
  dateFrom: string,
  dateTo: string,
): Promise<SyncResult> =>
  call(() =>
    coordApi.post<SyncResult>(
      "/cleaning-tasks/sync",
      { dateFrom, dateTo },
      { headers: authHeaders() },
    ),
  );

/** Crea la limpieza de UNA reserva (la de la vista previa), sin sincronizar el resto. */
export const createFromCheckout = (row: CheckoutRow) =>
  call(() =>
    coordApi.post<{
      created: boolean;
      taskId?: number | null;
      taskNumber?: string | null;
      message?: string;
    }>(
      "/cleaning-tasks",
      {
        hostawayReservationId: row.reservationId,
        listingName: row.listingName,
        listingId: row.listingId,
        checkoutDate: row.hostawayCheckoutDate ?? row.checkoutDate,
        checkoutTime: row.checkoutTime ?? "11:00",
      },
      { headers: authHeaders() },
    ),
  );

// ─── Empleados y checklists ─────────────────────────────────────────────────

export const fetchEmployees = async (): Promise<EmployeeOption[]> => {
  const body = await call(() =>
    coordApi.get<{ data: EmployeeOption[] }>("/cleaning-tasks/employees", {
      headers: authHeaders(),
    }),
  );
  return body.data;
};

export const fetchChecklists = async (): Promise<Checklist[]> => {
  const body = await call(() =>
    coordApi.get<{ data: Checklist[] }>("/cleaning-tasks/checklists", {
      headers: authHeaders(),
    }),
  );
  return body.data;
};

export const fetchChecklist = async (id: number): Promise<Checklist> => {
  const body = await call(() =>
    coordApi.get<{ data: Checklist }>(`/cleaning-tasks/checklists/${id}`, {
      headers: authHeaders(),
    }),
  );
  return body.data;
};

/** Crea (id = null) o edita un checklist. El archivo CSV es un campo más de la ficha. */
export const saveChecklist = (
  id: number | null,
  payload: SaveChecklistPayload,
) => {
  const form = new FormData();
  form.append("templateName", payload.templateName.trim());
  form.append("description", payload.description.trim());
  form.append("code", payload.code.trim());
  form.append("detalle", payload.detalle);
  if (payload.removeTemplate) form.append("removeTemplate", "true");
  if (payload.file) form.append("plantilla", payload.file);

  const config = { headers: authHeaders() };

  return call(() =>
    id === null
      ? coordApi.post<{ saved: boolean; created: boolean; id: number }>(
          "/cleaning-tasks/checklists",
          form,
          config,
        )
      : coordApi.put<{ saved: boolean; created: boolean; id: number }>(
          `/cleaning-tasks/checklists/${id}`,
          form,
          config,
        ),
  );
};

/** Descarga el archivo de la plantilla tal como está en openMAINT. */
export const downloadChecklistTemplate = async (
  id: number,
  fileName: string,
): Promise<void> => {
  const blob = await call(() =>
    coordApi.get<Blob>(`/cleaning-tasks/checklists/${id}/template`, {
      headers: authHeaders(),
      responseType: "blob",
    }),
  );
  saveBlob(blob, fileName);
};

/** Entrega un archivo al navegador. */
export const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
