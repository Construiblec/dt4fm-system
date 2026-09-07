import axios from "axios";
import { env } from "@/config/env";
import {
  mockGetAuthorization,
  mockListAuthorizations,
  mockRegeneratePin,
  mockSendPin,
} from "@/modules/supervisor-cav/services/authorizationsService.mock";
import type {
  AuthorizationResponse,
  ListAuthorizationsParams,
  ListAuthorizationsResponse,
} from "@/modules/supervisor-cav/types/Authorization";
import { redirectToLogin } from "@/shared/auth/returnTo";

/**
 * Endpoints propuestos, aún no confirmados con el backend — ver el mensaje de
 * handover para el detalle completo de qué pedirle:
 *
 *   GET  /access-authorizations?from&to        lista de próximos check-ins
 *   GET  /access-authorizations/:id            detalle (nunca trae el PIN)
 *   POST /access-authorizations/:id/regenerate genera un PIN nuevo
 *   POST /access-authorizations/:id/send       lo envía al huésped
 *
 * Con `VITE_CAV_MOCK=true` ninguno de los cuatro llega a tocar la red: se
 * resuelven con los datos quemados de `authorizationsService.mock.ts`.
 */
const useMock = env.VITE_CAV_MOCK === "true";

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * El backend gatea por `x-role`, pero la barrera real son los permisos de
 * grupo de la sesión en openMAINT: este header solo evita llamadas de un rol
 * equivocado.
 */
const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
  "x-role": localStorage.getItem("role") ?? "",
});

/** Redirige al login cuando la sesión de openMAINT ya no es válida. */
const handleUnauthorized = (error: unknown): never => {
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

const buildQuery = ({ from, to }: ListAuthorizationsParams) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
};

export const listAuthorizations = async (
  params: ListAuthorizationsParams = {},
): Promise<ListAuthorizationsResponse> => {
  if (useMock) return mockListAuthorizations();

  try {
    const { data } = await api.get<ListAuthorizationsResponse>(
      `/access-authorizations?${buildQuery(params)}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Nunca trae el PIN: solo su estado y la fecha hasta la que es válido. */
export const getAuthorization = async (
  id: number,
): Promise<AuthorizationResponse> => {
  if (useMock) return mockGetAuthorization(id);

  try {
    const { data } = await api.get<AuthorizationResponse>(
      `/access-authorizations/${id}`,
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

/** Reemplaza el PIN vigente por uno nuevo; queda "pending" hasta enviarlo. */
export const regeneratePin = async (
  id: number,
): Promise<AuthorizationResponse> => {
  if (useMock) return mockRegeneratePin(id);

  try {
    const { data } = await api.post<AuthorizationResponse>(
      `/access-authorizations/${id}/regenerate`,
      {},
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};

export const sendPin = async (id: number): Promise<AuthorizationResponse> => {
  if (useMock) return mockSendPin(id);

  try {
    const { data } = await api.post<AuthorizationResponse>(
      `/access-authorizations/${id}/send`,
      {},
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
