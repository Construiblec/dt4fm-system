import { Clock3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useActiveTaskTimer } from "@/modules/incidentes/hooks/useActiveTaskTimer";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

/**
 * Quién ve esta barra y en qué rutas lo decide AppLayout (única fuente de
 * verdad). Aquí solo queda el guard de tipo sobre activeTask.
 */
export const GlobalTaskIndicator = () => {
  const navigate = useNavigate();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const { elapsedFormatted, isOvertime } = useActiveTaskTimer();

  if (!activeTask) return null;

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-50 border-b shadow-lg ${
        isOvertime
          ? "border-amber-700 bg-amber-600 text-white"
          : "border-cyan-700 bg-cyan-600 text-white"
      }`}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 animate-pulse" />
            <span className="truncate text-sm font-semibold">
              Tarea en progreso: {activeTask.taskNumber}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/90">
            {elapsedFormatted} transcurridos
            {isOvertime ? " · tiempo excedido" : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate(`/cleaning-tasks/${activeTask.id}/execute`)}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-cyan-700"
        >
          Regresar
        </button>
      </div>
    </div>
  );
};
