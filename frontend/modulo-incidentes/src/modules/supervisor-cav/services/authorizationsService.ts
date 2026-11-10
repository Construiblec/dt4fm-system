import {
  mockGetAuthorization,
  mockListAuthorizations,
  mockRegeneratePin,
  mockUpdateAccessLevel,
} from "@/modules/supervisor-cav/services/authorizationsService.mock";
import {
  cavApi as api,
  getAuthHeaders,
  handleUnauthorized,
  isCavMock as useMock,
} from "@/modules/supervisor-cav/services/cavApi";
import type {
  AccessLevelChoice,
  AuthorizationResponse,
  ListAuthorizationsParams,
  ListAuthorizationsResponse,
} from "@/modules/supervisor-cav/types/Authorization";

/**
 * Endpoints del backend (módulo `access-control`):
 *
 *   GET  /access-authorizations?from&to             próximos check-ins
 *   GET  /access-authorizations/:stayId             detalle (nunca trae el PIN)
 *   POST /access-authorizations/:stayId/regenerate  renueva el PIN
 *   POST /access-authorizations/:stayId/access-level { accessLevel }  (`none` revoca)
 *
 * El backend guarda el PIN en la reserva de Hostaway; al renovarlo, además avisa por el chat.
 *
 * Con `VITE_CAV_MOCK=true` ninguno llega a tocar la red: se resuelven con los
 * datos quemados de `authorizationsService.mock.ts`.
 */

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

/** Reemplaza el PIN vigente; el backend avisa al huésped del nuevo. */
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

/** Peatonal, vehicular o ambos; `none` revoca y un nivel sobre un revocado lo restaura. */
export const updateAccessLevel = async (
  id: string,
  accessLevel: AccessLevelChoice,
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
