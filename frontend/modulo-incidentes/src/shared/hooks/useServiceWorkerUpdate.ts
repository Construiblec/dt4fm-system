import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Volver a la app varias veces seguidas no debe disparar un chequeo cada vez. */
const MIN_CHECK_GAP_MS = 60 * 1000;

/**
 * Registra el service worker, descubre las versiones nuevas y las activa a
 * pedido. Con `injectRegister: null` en vite.config, este hook es el único
 * registro: si nadie lo llama, la app no es instalable.
 *
 * Cuándo activarla y cuándo recargar lo decide `AutoUpdate`; aquí no se recarga
 * nada por cuenta propia.
 */
export const useServiceWorkerUpdate = () => {
  const [activated, setActivated] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      let lastCheck = Date.now();
      const check = () => {
        if (registration.installing || !navigator.onLine) return;
        lastCheck = Date.now();
        void registration.update();
      };

      // Una sesión instalada puede vivir horas sin navegar: hay que sondear.
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);

      // Y sobre todo al volver a la app: es cuando el usuario abre la PWA que
      // dejó en segundo plano, y el mejor momento para traer la versión nueva.
      document.addEventListener("visibilitychange", () => {
        if (
          document.visibilityState === "visible" &&
          Date.now() - lastCheck >= MIN_CHECK_GAP_MS
        ) {
          check();
        }
      });
    },
    // El SW nuevo ya controla la página. Sin este callback `vite-plugin-pwa`
    // recargaría en el acto, esté donde esté el usuario; así decide AutoUpdate.
    onNeedReload() {
      setActivated(true);
    },
    onRegisterError(error) {
      console.error("No se pudo registrar el service worker", error);
    },
  });

  return {
    /** Hay una versión nueva instalada, esperando. */
    needRefresh,
    /** La versión nueva ya tomó el control: falta recargar para usarla. */
    activated,
    /** Pide al SW nuevo que se active (`SKIP_WAITING`). */
    activate: async () => {
      // Primero una petición que el SW actual tenga que atender y terminar. Si
      // SKIP_WAITING llega justo cuando ese SW está arrancando (lo despiertan
      // las peticiones de la pantalla recién abierta), Chrome deja la
      // activación colgada sin plazo. Comprobado con una prueba real.
      try {
        await fetch("/manifest.webmanifest", { cache: "no-store" });
      } catch {
        // Sin red da igual: se intenta activar de todos modos.
      }
      await updateServiceWorker();
    },
  };
};
