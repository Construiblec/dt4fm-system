import { MapPin, User, CalendarDays, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";

const phaseStyles: Record<string, { badge: string; border: string }> = {
  Assigned: { badge: "bg-blue-100 text-blue-700", border: "border-blue-400" },
  InExecution: {
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-400",
  },
  Completed: {
    badge: "bg-violet-100 text-violet-700",
    border: "border-violet-500",
  },
  Reviewed: {
    badge: "bg-emerald-100 text-emerald-700",
    border: "border-emerald-500",
  },
  Cancelled: { badge: "bg-red-100 text-red-700", border: "border-red-400" },
};

const phaseLabels: Record<string, string> = {
  Assigned: "Asignada",
  InExecution: "En ejecución",
  Completed: "Completada",
  Reviewed: "Revisada",
  Cancelled: "Cancelada",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  task: CleaningTask;
  onReview?: (task: CleaningTask) => void;
};

export const SupervisorTaskCard = ({ task }: Props) => {
  const navigate = useNavigate();
  const style = phaseStyles[task.phase] ?? {
    badge: "bg-slate-100 text-slate-700",
    border: "border-slate-300",
  };
  const canReview = task.phase === "Completed";

  return (
    <article
      className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${style.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-400">
            {task.taskNumber}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900">
            {task.unit?.description ?? task.description}
          </h3>
        </div>
        <span
          className={`flex-shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${style.badge}`}
        >
          {phaseLabels[task.phase] ?? task.phase}
        </span>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-1.5 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span className="truncate">{task.description}</span>
        </div>

        <div className="flex items-center gap-2">
          <User className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>{task.employee?.name ?? "Sin asignar"}</span>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <span>Generada: {formatDate(task.generatedDate)}</span>
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

        {task.observations && (
          <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 italic">
            "{task.observations}"
          </p>
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
