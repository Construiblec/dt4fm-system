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
  arrivalDate: string;
  departureDate: string;
  accessValidFrom: string;
  accessValidTo: string;
  stayStatus: "pending" | "active" | "completed" | "cancelled";
  pinState: GuestPinState;
  pin: string | null;
  credentialId: string | null;
  syncState: "pending" | "synced" | "failed" | null;
};

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * El huésped no tiene sesión: su única credencial es el token del enlace.
 *
 * Se manda por cabecera y no en el query string. El backend acepta `?token=`
 * para la primera carga, pero un token en la URL queda en el historial del
 * navegador y en los registros de cualquier proxy; en cuanto la página lo tiene
 * leído, las llamadas van por `Authorization`.
 */
export const getGuestPortalData = async (
  token: string,
): Promise<GuestPortalData> => {
  const { data } = await api.get<GuestPortalData>("/guest/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  return data;
};

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
