import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

/**
 * Renovación de la sesión de openMAINT, en un solo sitio.
 *
 * Cada servicio crea su propia instancia de axios (o usa `fetch`) y decide qué
 * hacer con un 401: redirigir, avisar o dejárselo a la página. Esto no cambia
 * eso. Se engancha antes: intenta renovar la sesión y reintenta la petición
 * **una vez**. Solo si no puede, el 401 llega al servicio como hasta ahora.
 *
 * Mientras nadie registre cómo renovar (`setSessionRenewer`), `renewSession`
 * devuelve `false`. Lo único que hace entonces es reintentar cuando la sesión
 * cambió mientras la petición iba de camino, por ejemplo tras volver a entrar
 * en otra pestaña.
 */

/** Cabecera en la que cada servicio manda la sesión al backend. */
export type SessionHeader = "authorization" | "x-session-token";

type Renewer = () => Promise<boolean>;

const neverRenews: Renewer = async () => false;

let renewer: Renewer = neverRenews;
let inFlight: Promise<boolean> | null = null;

const currentSessionId = () => localStorage.getItem("sessionId") ?? "";

/**
 * Registra cómo se renueva la sesión. Debe dejar el `sessionId` nuevo en
 * `localStorage` y devolver `true`; `false` si no pudo. Sin argumento vuelve
 * a no renovar.
 */
export const setSessionRenewer = (next: Renewer = neverRenews) => {
  renewer = next;
};

/** Varias peticiones con 401 a la vez comparten una sola renovación. */
export const renewSession = (): Promise<boolean> => {
  inFlight ??= renewer()
    .catch(() => false)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
};

/**
 * Sesión con la que reintentar una petición rechazada con 401, o `null` si no
 * hay que reintentar. `used` es la sesión que llevaba la petición.
 */
const sessionForRetry = async (used: string): Promise<string | null> => {
  // Sin sesión no hay nada que renovar: un 401 sin ella es, por ejemplo, una
  // contraseña equivocada en el login.
  if (!used) return null;

  // Otra petición la renovó mientras esta iba de camino.
  const current = currentSessionId();
  if (current && current !== used) return current;

  if (!(await renewSession())) return null;

  return currentSessionId() || null;
};

type RetriableConfig = InternalAxiosRequestConfig & {
  _sessionRetried?: boolean;
};

/**
 * Engancha la renovación a una instancia de axios. `header` es donde ese
 * servicio manda la sesión: se reescribe con la nueva antes de reintentar.
 */
export const attachSessionRenewal = (
  instance: AxiosInstance,
  header: SessionHeader,
) => {
  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (
      !axios.isAxiosError(error) ||
      error.response?.status !== 401 ||
      !error.config
    ) {
      throw error;
    }

    const config = error.config as RetriableConfig;
    if (config._sessionRetried) throw error;

    const session = await sessionForRetry(
      String(config.headers.get(header) ?? ""),
    );
    if (!session) throw error;

    config._sessionRetried = true;
    config.headers.set(header, session);

    return instance.request(config);
  });
};

/**
 * Lo mismo para los servicios que usan `fetch`, que mandan la sesión en
 * `Authorization`. Devuelve la respuesta tal cual, también el 401 si no se
 * pudo renovar, para que cada servicio la trate como hasta ahora.
 */
export const fetchWithSessionRenewal = async (
  url: string,
  init: RequestInit = {},
): Promise<Response> => {
  const response = await fetch(url, init);
  if (response.status !== 401) return response;

  const headers = new Headers(init.headers);
  const session = await sessionForRetry(headers.get("authorization") ?? "");
  if (!session) return response;

  headers.set("authorization", session);

  return fetch(url, { ...init, headers });
};
