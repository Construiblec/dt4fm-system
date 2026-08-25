/**
 * Destino pendiente tras un 401. Sin esto, tocar una notificación con la sesión
 * caducada lleva al login y pierde la tarea: el usuario tiene que buscarla a
 * mano, que es justo lo que la notificación venía a ahorrarle.
 */

const STORAGE_KEY = "post-login-return-to";

/** Pasado ese plazo el destino ya no es lo que el usuario venía a hacer. */
const TTL_MS = 30 * 60 * 1000;

/** Login y recuperación, más el flujo de residentes, que tiene su propio acceso. */
const IGNORED_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/visitor-form",
  "/owner",
];

type PendingRoute = { path: string; username: string | null; at: number };

/** Descarta rutas externas: `//host` navegaría fuera de la aplicación. */
const isRestorable = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  path !== "/" &&
  !IGNORED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

/** Guarda la ruta actual antes de mandar al login. */
export const rememberReturnTo = (path?: string) => {
  const target = path ?? `${window.location.pathname}${window.location.search}`;

  if (!isRestorable(target)) return;

  const pending: PendingRoute = {
    path: target,
    username: localStorage.getItem("username"),
    at: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
};

export const forgetReturnTo = () => localStorage.removeItem(STORAGE_KEY);

/**
 * Devuelve el destino pendiente y lo consume. Solo lo restaura si vuelve el
 * mismo usuario: en un celular compartido, el siguiente que entre no debe
 * aterrizar en la tarea del anterior.
 */
export const consumeReturnTo = (username: string): string | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  forgetReturnTo();

  if (!raw) return null;

  let pending: Partial<PendingRoute>;
  try {
    pending = JSON.parse(raw) as Partial<PendingRoute>;
  } catch {
    return null;
  }

  // `username` nulo = nadie había iniciado sesión; cualquiera puede continuar.
  const sameUser = pending.username == null || pending.username === username;
  const fresh =
    typeof pending.at === "number" && Date.now() - pending.at <= TTL_MS;

  if (!sameUser || !fresh || !isRestorable(pending.path)) return null;

  return pending.path;
};

/** Recuerda el destino y manda al login. Para los manejadores de 401. */
export const redirectToLogin = () => {
  rememberReturnTo();
  window.location.assign("/login");
};
