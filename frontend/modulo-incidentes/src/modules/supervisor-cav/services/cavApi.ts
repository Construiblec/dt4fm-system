import axios from "axios";
import { env } from "@/config/env";
import { redirectToLogin } from "@/shared/auth/returnTo";

/** Con `VITE_CAV_MOCK=true` ningún servicio de CAV llega a tocar la red. */
export const isCavMock = env.VITE_CAV_MOCK === "true";

export const cavApi = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * Solo la sesión. El rol **no** se manda desde el cliente: el backend lo
 * resuelve contra openMAINT con esa misma sesión, que es lo que corrigió
 * BP-003 — un `x-role` de `localStorage` lo elige quien quiera.
 */
export const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
});

/** Redirige al login cuando la sesión de openMAINT ya no es válida. */
export const handleUnauthorized = (error: unknown): never => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    redirectToLogin();
  }

  throw error;
};

/** Mensaje que el backend devolvió, para poder mostrarlo tal cual en la UI. */
export const getApiErrorMessage = (
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
