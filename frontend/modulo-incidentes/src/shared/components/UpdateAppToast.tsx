import { RefreshCw } from "lucide-react";
import { useServiceWorkerUpdate } from "@/shared/hooks/useServiceWorkerUpdate";

/**
 * Además del aviso, este componente es quien registra el service worker: debe
 * estar montado siempre, no detrás de una condición de ruta.
 */
export const UpdateAppToast = () => {
  const { needRefresh, dismiss, reload } = useServiceWorkerUpdate();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl">
        <div className="flex min-w-0 items-center gap-2">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <p className="truncate text-sm font-semibold">
            Hay una versión nueva disponible
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={reload}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
          >
            Actualizar
          </button>
        </div>
      </div>
    </div>
  );
};
