import { Bell, X } from "lucide-react";
import type { NotificationPromptMode } from "@/shared/hooks/useNotificationPrompt";

type EnableNotificationsBannerProps = {
  mode: NotificationPromptMode;
  /** Cuántas barras fijas hay ya por encima (0, 1 o 2). */
  stackIndex: number;
  onEnable: () => void;
  onDismiss: () => void;
};

const TOP_BY_INDEX = ["top-0", "top-14", "top-28"];

export const EnableNotificationsBanner = ({
  mode,
  stackIndex,
  onEnable,
  onDismiss,
}: EnableNotificationsBannerProps) => {
  if (mode === "hidden") {
    return null;
  }

  return (
    <div
      className={`fixed left-0 right-0 z-40 border-b border-blue-800 bg-brand text-white shadow-lg ${
        TOP_BY_INDEX[stackIndex] ?? "top-0"
      }`}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Activa las notificaciones</p>
            <p className="text-xs text-white/90">
              Entérate al instante de tus tareas asignadas
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onEnable}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-brand"
          >
            Activar
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Descartar"
            className="rounded-full p-1.5 text-white/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
