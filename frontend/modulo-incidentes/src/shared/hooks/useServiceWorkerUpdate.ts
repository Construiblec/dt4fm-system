import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registra el service worker y avisa cuando hay una versión nueva esperando.
 * Con `injectRegister: null` en vite.config, este hook es el único registro:
 * si nadie lo llama, la app no es instalable.
 */
export const useServiceWorkerUpdate = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Una sesión instalada puede vivir horas sin navegar: hay que sondear.
      setInterval(() => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
    onRegisterError(error) {
      console.error("No se pudo registrar el service worker", error);
    },
  });

  return {
    needRefresh,
    dismiss: () => setNeedRefresh(false),
    reload: () => void updateServiceWorker(true),
  };
};
