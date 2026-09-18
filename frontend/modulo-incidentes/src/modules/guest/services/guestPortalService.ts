import axios from "axios";
import { env } from "@/config/env";

/** Por qué el PIN no se ve, cuando no se ve. Lo decide el backend. */
export type GuestPinState =
  | "disponible"
  | "antes-del-checkin"
  | "finalizado"
  | "sin-cobertura";

export type GuestPortalData = {
  stayId: string;
  reservationId: string;
  guestName: string;
  guestEmail: string | null;
  listingId: string;
  /** Nulo cuando el listing de Hostaway no está mapeado a una unidad. */
  openmaintUnitId: number | null;
  buildingId: number | null;
  /** Fechas puras `YYYY-MM-DD`: no pasarlas por `new Date()` directamente. */
  arrivalDate: string;
  departureDate: string;
  accessValidFrom: string;
  accessValidTo: string;
  checkInAt: string;
  checkOutAt: string;
  stayStatus: "pending" | "active" | "completed" | "cancelled";
  pinState: GuestPinState;
  pin: string | null;
  credentialId: string | null;
  syncState: "pending" | "synced" | "failed" | null;
  hasVehicularAccess: boolean;
  /** El backend ya cruzó ventana, ámbito y que la apertura remota esté activa. */
  canOpenVehicularGate: boolean;
  /** Mientras no sea nulo, el huésped puede bajar la barrera que abrió. */
  vehicularGateOpenUntil: string | null;
  canReportIncident: boolean;
  unitName: string | null;
  buildingName: string | null;
  buildingAddress: string | null;
};

export type GateAction = "open" | "close";

/** `uncertain`: la orden salió, pero nadie confirmó si la barrera se movió. */
export type GateCommandResult = {
  requestId: string;
  outcome: "opened" | "closed" | "failed" | "uncertain";
  errorCode?: string;
  at?: string;
  /** Hasta cuándo sigue arriba tras abrirla; nulo en lo demás. */
  openUntil: string | null;
};

export type GuestIncidentInput = {
  description: string;
  location?: string;
  images: File[];
};

export type GuestIncidentResult = {
  incidentId: number;
  attachmentsUploaded: number;
  attachmentsFailed: number;
};

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * El huésped no tiene sesión: su única credencial es el token del enlace, y
 * viaja siempre por cabecera, nunca en la URL.
 */
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Canjea el código de `/g/<código>` por el token del portal. */
export const redeemGuestShortLink = async (code: string): Promise<string> => {
  const { data } = await api.post<{ token: string }>(
    "/guest/short-link/redeem",
    { code },
  );

  return data.token;
};

export const getGuestPortalData = async (
  token: string,
): Promise<GuestPortalData> => {
  const { data } = await api.get<GuestPortalData>("/guest/me", {
    headers: authHeader(token),
  });

  return data;
};

export const commandVehicularGate = async (
  token: string,
  action: GateAction,
  requestId: string,
): Promise<GateCommandResult> => {
  const { data } = await api.post<GateCommandResult>(
    `/guest/vehicular-gate/${action}`,
    { requestId },
    { headers: authHeader(token) },
  );

  return data;
};

export const createGuestIncident = async (
  token: string,
  input: GuestIncidentInput,
): Promise<GuestIncidentResult> => {
  const form = new FormData();
  form.append("description", input.description);

  if (input.location) form.append("location", input.location);

  input.images.forEach((image) => form.append("images", image, image.name));

  const { data } = await api.post<GuestIncidentResult>(
    "/guest/incidents",
    form,
    { headers: authHeader(token) },
  );

  return data;
};

export const isGuestLinkInvalid = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 401;

/** El mensaje que devolvió el backend, para mostrarlo tal cual. */
export const getGuestApiErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] })
      ?.message;

    if (Array.isArray(message)) return message.join(". ");
    if (typeof message === "string") return message;
  }

  return fallback;
};
