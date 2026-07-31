import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MapPin, Clock, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { startCleaningTask } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";

const phaseStyles: Record<string, string> = {
  Reviewed: "bg-emerald-100 text-emerald-700",
  Assigned: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
  InExecution: "bg-amber-100 text-amber-700",
  Completed: "bg-slate-100 text-slate-700",
  Cancelled: "bg-red-100 text-red-700",
};

const actionablePhases = new Set(["Assigned", "InProgress", "InExecution"]);

function calcDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(diffMs) || diffMs <= 0) return "—";
  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatAssignedDate(dateStr?: string | null): string {
  if (!dateStr) return "Sin asignar";
  return new Date(dateStr).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(isoStr?: string | null): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = Pick<
  CleaningTask,
  | "id"
  | "taskNumber"
  | "description"
  | "unit"
  | "assignedDate"
  | "plannedStartTime"
  | "plannedEndTime"
  | "phase"
  | "actualStartTime"
>;

export const CleaningTaskCard = ({
  id,
  taskNumber,
  description,
  unit,
  assignedDate,
  plannedStartTime,
  plannedEndTime,
  phase,
  actualStartTime,
}: Props) => {
  const navigate = useNavigate();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const startTask = useCleaningTaskExecutionStore((state) => state.startTask);
  const syncActiveTask = useCleaningTaskExecutionStore((state) => state.syncActiveTask);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const duration = calcDuration(plannedStartTime, plannedEndTime);
  const isSameActiveTask = activeTask?.id === id;
  const isTaskAlreadyInExecution = isActiveCleaningTaskPhase(phase);
  const isAnotherTaskActive = activeTask !== null && activeTask.id !== id;
  const isActionable = actionablePhases.has(phase) && !isAnotherTaskActive;
  const unitLabel = unit?.description ?? description;

  const startMutation = useMutation({
    mutationFn: () => startCleaningTask(id),
    onSuccess: (taskDetail) => {
      startTask({
        id,
        taskNumber,
        description,
        phase: taskDetail.phase ?? "InExecution",
        actualStartTime: taskDetail.actualStartTime ?? actualStartTime ?? new Date().toISOString(),
        plannedEndTime,
        unitDescription: unit?.description ?? description,
      });
      navigate(`/cleaning-tasks/${id}/execute`);
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo iniciar la tarea de limpieza",
      );
    },
  });

  const handleStart = () => {
    if (isSameActiveTask) {
      navigate(`/cleaning-tasks/${id}/execute`);
      return;
    }

    if (isTaskAlreadyInExecution) {
      syncActiveTask({
        id,
        taskNumber,
        description,
        phase,
        actualStartTime: actualStartTime ?? new Date().toISOString(),
        plannedEndTime,
        unitDescription: unit?.description ?? description,
      });
      navigate(`/cleaning-tasks/${id}/execute`);
      return;
    }

    startMutation.mutate();
  };

  return (
    <article className="rounded-xl border-l-4 border-cyan-500 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">
            Limpieza
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {unitLabel}
          </h3>
        </div>

        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {formatAssignedDate(assignedDate)}
        </span>
      </div>

      {/* Phase badge */}
      <div className="mt-2">
        <span
          className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${
            phaseStyles[phase] ?? "bg-slate-100 text-slate-700"
          }`}
        >
          {phase}
        </span>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{description}</span>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 flex-shrink-0" />
          <span>Inicio planeado: {formatTime(plannedStartTime)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 flex-shrink-0" />
          <span>Duración estimada: {duration}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex justify-end">
        <button
          disabled={!isActionable}
          onClick={handleStart}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isActionable
              ? "bg-brand text-white hover:bg-brand-hover"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {isSameActiveTask || isTaskAlreadyInExecution ? "Continuar" : "Iniciar"}
        </button>
      </div>

      <LoadingModal open={startMutation.isPending} message="Iniciando tarea..." />
      <ErrorModal
        open={errorMessage !== null}
        title="No se pudo iniciar la tarea"
        message={
          errorMessage ??
          (isAnotherTaskActive
            ? `Ya tienes una tarea activa: ${activeTask?.taskNumber}`
            : "No se pudo iniciar la tarea")
        }
        onClose={() => setErrorMessage(null)}
      />
    </article>
  );
};
