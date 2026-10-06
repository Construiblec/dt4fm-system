import axios from "axios";
import { checkSession } from "@/services/api";
import { hasActiveSession, isVisitorSession } from "@/shared/auth/session";
import { redirectToLogin } from "@/shared/auth/returnTo";
import { requestPersistentStorage } from "@/shared/pwa/persistentStorage";

/**
 * Comprueba la sesión al abrir la app y cada vez que vuelve a primer plano.
 *
 * `hasActiveSession()` solo mira si hay un `sessionId` guardado, no si
 * openMAINT lo sigue aceptando. Sin esto, la PWA que se abre por la mañana con
 * la sesión de ayer pinta el dashboard vacío y no manda al login hasta que
 * falla la primera llamada de alguna pantalla.
 *
 * Además cuenta como uso: con «Mantener la sesión iniciada», cada comprobación
 * aplaza 30 días el momento en que el backend deja de mantenerla viva.
 *
 * Igual que `installPromptStore`, se engancha al evaluar el módulo.
 */

/** Volver a la app cada pocos segundos no debe costar una llamada cada vez. */
const MIN_INTERVAL_MS = 60_000;

/**
 * Pantallas que no usan la sesión del usuario: login y recuperación, registro
 * de residentes, visitantes y huéspedes. En ellas no se comprueba, y así el
 * login tampoco puede entrar en bucle consigo mismo.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/visitor-form",
  "/owner/register",
  "/owner/auth",
  "/guest",
];

const isPublicRoute = (path: string) =>
  path === "/" ||
  PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

let lastCheckAt = 0;

const checkStoredSession = async () => {
  if (!hasActiveSession() || isVisitorSession()) return;
  if (isPublicRoute(window.location.pathname)) return;

  if (Date.now() - lastCheckAt < MIN_INTERVAL_MS) return;
  lastCheckAt = Date.now();

  try {
    await checkSession();
  } catch (error) {
    // Sin red u openMAINT caído no es una sesión caducada: no se echa a nadie.
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      redirectToLogin();
    }
  }
};

if (hasActiveSession()) {
  void requestPersistentStorage();
}

void checkStoredSession();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    void checkStoredSession();
  }
});
