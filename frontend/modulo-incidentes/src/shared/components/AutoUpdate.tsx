import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { router } from "@/app/router/router";
import { useServiceWorkerUpdate } from "@/shared/hooks/useServiceWorkerUpdate";
import { isSafeToUpdate } from "@/shared/pwa/updatePolicy";

/** Una versión detectada en los primeros segundos es de una app recién abierta. */
const JUST_OPENED_MS = 15_000;
/** Si la activación no llegó en este tiempo, el siguiente momento seguro la vuelve a pedir. */
const RETRY_ACTIVATION_MS = 15_000;

/** Pantalla sin trabajo a medias y ningún guardado en curso. */
const canReloadNow = (queryClient: QueryClient) =>
  isSafeToUpdate(router.state.location) && queryClient.isMutating() === 0;

/**
 * Aplica sola la versión nueva de la app, sin botón "Actualizar", en momentos
 * en que recargar no le quita nada al usuario:
 * - recién abierta la app;
 * - al terminar de cambiar de pantalla;
 * - al volver a la app o al dejarla en segundo plano.
 *
 * Y siempre que la pantalla actual sea segura (`isSafeToUpdate`) y no haya un
 * guardado en curso. Si no lo es, espera al siguiente momento. Nunca recarga de
 * golpe a quien está quieto mirando una pantalla.
 *
 * Son dos pasos: activar el SW nuevo y, cuando ya controla la página, recargar.
 * Los dos se comprueban contra la pantalla actual, porque la activación puede
 * tardar y para entonces el usuario puede estar en otra.
 *
 * Además es quien registra el service worker: debe estar montado siempre. Vive
 * fuera del `RouterProvider`, por eso lee la ruta del `router` y no de un hook.
 */
export const AutoUpdate = () => {
  const { needRefresh, activated, activate } = useServiceWorkerUpdate();
  const queryClient = useQueryClient();

  const state = useRef({ needRefresh, activated, activate });
  const requestedAt = useRef<number | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    state.current = { needRefresh, activated, activate };
  });

  // Un paso hacia la versión nueva, si la pantalla lo permite ahora.
  const step = useRef(() => {});
  useEffect(() => {
    step.current = () => {
      if (reloading.current || !canReloadNow(queryClient)) return;

      if (state.current.activated) {
        reloading.current = true;
        window.location.reload();
        return;
      }

      const pending =
        requestedAt.current !== null &&
        Date.now() - requestedAt.current < RETRY_ACTIVATION_MS;
      if (state.current.needRefresh && !pending) {
        requestedAt.current = Date.now();
        void state.current.activate();
      }
    };
  }, [queryClient]);

  useEffect(() => {
    // Al terminar una navegación: la pantalla iba a cambiar de todos modos.
    // La clave sola no basta: varias entradas del historial pueden traer
    // `"default"` (la de carga y las que no creó el router), así que también
    // cuenta la ruta.
    const where = (l: { pathname: string; search: string; key: string }) =>
      `${l.pathname}${l.search}#${l.key}`;
    let last = where(router.state.location);
    const unsubscribe = router.subscribe((routerState) => {
      if (routerState.navigation.state !== "idle") return;
      const current = where(routerState.location);
      if (current === last) return;
      last = current;
      step.current();
    });

    // En los dos sentidos: al volver la ve ya actualizada y al irse no la nota.
    // En una pantalla insegura no aplica ni en segundo plano: la cámara del
    // celular manda la PWA al fondo mientras se toma la foto.
    const onVisibility = () => step.current();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // La versión nueva acaba de aparecer: si la app recién se abrió o está en
  // segundo plano, no hace falta esperar a otro momento.
  useEffect(() => {
    if (!needRefresh) return;
    const justOpened = performance.now() < JUST_OPENED_MS;
    const hidden = document.visibilityState === "hidden";
    if (justOpened || hidden) step.current();
  }, [needRefresh]);

  // El SW nuevo ya tomó el control (normalmente al instante de pedirlo, en un
  // momento seguro): recargar ahora, o en el siguiente momento seguro.
  useEffect(() => {
    if (activated) step.current();
  }, [activated]);

  return null;
};
