import axios from "axios";
import { env } from "@/config/env";
import {
  mockGetAuthorization,
  mockListAuthorizations,
  mockRegeneratePin,
  mockUpdateAccessLevel,
} from "@/modules/supervisor-cav/services/authorizationsService.mock";
import type {
  AccessLevel,
  AuthorizationResponse,
  ListAuthorizationsParams,
  ListAuthorizationsResponse,
} from "@/modules/supervisor-cav/types/Authorization";
import { redirectToLogin } from "@/shared/auth/returnTo";

/**
 * Endpoints del backend (módulo `access-control`):
 *
 *   GET  /access-authorizations?from&to             próximos check-ins
 *   GET  /access-authorizations/:stayId             detalle (nunca trae el PIN)
 *   POST /access-authorizations/:stayId/regenerate  renueva el PIN
 *   POST /access-authorizations/:stayId/access-level { accessLevel }
 *
 * No hay endpoint de envío: el PIN se actualiza en la base y el huésped lo ve
 * en su portal la próxima vez que abre su enlace, que nunca cambia.
 *
 * Con `VITE_CAV_MOCK=true` ninguno llega a tocar la red: se resuelven con los
 * datos quemados de `authorizationsService.mock.ts`.
 */
const useMock = env.VITE_CAV_MOCK === "true";

const api = axios.create({
  baseURL: env.VITE_API_URL.replace(/\/api\/?$/, ""),
});

/**
 * Solo la sesión. El rol **no** se manda desde el cliente: el backend lo
 * resuelve contra openMAINT con esa misma sesión, que es lo que corrigió
 * BP-003 — un `x-role` de `localStorage` lo elige quien quiera.
 */
const getAuthHeaders = () => ({
  Authorization: localStorage.getItem("sessionId") ?? "",
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

/** Nunca trae el PIN: solo su nivel de acceso y hasta cuándo es válido. */
export const getAuthorization = async (
  id: string,
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

/**
 * Reemplaza el PIN vigente por uno nuevo. No hay nada que enviar después: el
 * portal del huésped lee el PIN vigente cada vez que se abre.
 */
export const regeneratePin = async (
  id: string,
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

/** A qué tipo de acceso habilita el PIN: peatonal, vehicular, o ambos. */
export const updateAccessLevel = async (
  id: string,
  accessLevel: AccessLevel,
): Promise<AuthorizationResponse> => {
  if (useMock) return mockUpdateAccessLevel(id, accessLevel);

  try {
    const { data } = await api.post<AuthorizationResponse>(
      `/access-authorizations/${id}/access-level`,
      { accessLevel },
      { headers: getAuthHeaders() },
    );
    return data;
  } catch (error) {
    return handleUnauthorized(error);
  }
};
