import { MapPin, User, CalendarDays, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getCleaningPhaseBadge,
  getCleaningPhaseBorder,
  getCleaningPhaseLabel,
} from "@/modules/incidentes/constants/cleaningPhase";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";

import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { formatDayMonth as formatDate, formatTime } from "@/shared/utils/dateUtils";

type Props = {
  task: CleaningTask;
  onReview?: (task: CleaningTask) => void;
};

export const SupervisorTaskCard = ({ task }: Props) => {
  const navigate = useNavigate();
  const badge = getCleaningPhaseBadge(task.phase);
  const border = getCleaningPhaseBorder(task.phase);

  // Se deduce de los datos, no del texto de observaciones: una tarea recién asignada
  // nunca trae actualStartTime (al reabrir se conserva el del primer inicio), y
  // executionTime solo existe tras una finalización previa.
  const isReopened =
    (task.phase === "Assigned" && task.actualStartTime != null) ||
    (task.phase === "InExecution" && (task.executionTime ?? 0) > 0);

  return (
    <article
      className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">
            {task.description}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900">
            {task.taskNumber || "Sin Número de Tarea"}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`flex-shrink-0 ${badge}`}
          >
            {getCleaningPhaseLabel(task.phase)}
          </span>
          {isReopened && (
            <span className="flex-shrink-0 rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
              Reabierta
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span className="truncate">{task.unit?.description ?? task.description}</span>
        </div>

        <div className="flex items-center gap-2">
          <User className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>{formatEmployeeName(task.employee?.name)}</span>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>Planificada: {formatDate(task.plannedStartTime)}</span>
        </div>

        {task.actualStartTime && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span>
              {formatTime(task.actualStartTime)}
              {task.actualEndTime
                ? ` → ${formatTime(task.actualEndTime)}`
                : " (en curso)"}
            </span>
          </div>
        )}

      </div>

      {/* Footer — cualquier tarea puede abrirse en detalle */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate(`/supervisor/tasks/${task.id}`)}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          {task.phase === "Completed" ? "Revisar" : "Ver detalle"}
        </button>
      </div>
    </article>
  );
};
