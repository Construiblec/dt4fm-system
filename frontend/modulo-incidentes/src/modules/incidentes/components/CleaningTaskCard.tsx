import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Clock, Timer, AlertTriangle, PauseCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getCleaningPhaseBadge,
  getCleaningPhaseLabel,
} from "@/modules/incidentes/constants/cleaningPhase";
import { startCleaningTask } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";
import {
  formatDayMonth as formatTaskDate,
  formatTime,
} from "@/shared/utils/dateUtils";

const actionablePhases = new Set(["Assigned", "InProgress", "InExecution"]);

function calcDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return "—";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (isNaN(diffMs) || diffMs <= 0) return "—";
  const totalMinutes = Math.round(diffMs / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;

  if (d > 0) {
    let res = `${d}d`;
    if (h > 0) res += ` ${h}h`;
    if (m > 0) res += ` ${m}min`;
    return res;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Minutos acumulados en OpenMAINT, en el mismo formato que las duraciones. */
function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total <= 0) return "0min";
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;

  if (d > 0) {
    let res = `${d}d`;
    if (h > 0) res += ` ${h}h`;
    if (m > 0) res += ` ${m}min`;
    return res;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}



function formatOverdue(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hhmmss = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${hhmmss}` : hhmmss;
}

function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

type Props = Pick<
  CleaningTask,
  | "id"
  | "taskNumber"
  | "description"
  | "unit"
  | "plannedStartTime"
  | "plannedEndTime"
  | "phase"
  | "actualStartTime"
  | "actualEndTime"
  | "executionTime"
  | "isPaused"
  | "sessionStartedAt"
  | "sessionBaseMinutes"
>;

export const CleaningTaskCard = ({
  id,
  taskNumber,
  description,
  unit,
  plannedStartTime,
  plannedEndTime,
  phase,
  actualStartTime,
  executionTime,
  isPaused,
  sessionStartedAt,
  sessionBaseMinutes,
}: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  /** Tiempo ya registrado en OpenMAINT: lo trabajado antes de la pausa. */
  const accumulatedMinutes = Math.max(0, executionTime ?? 0);
  const workedLabel = isPaused ? formatMinutes(accumulatedMinutes) : null;

  // Se deduce de los datos, no del texto de observaciones: una tarea recién asignada
  // nunca trae actualStartTime (al reabrir se conserva el del primer inicio), y
  // executionTime solo existe tras una finalización previa. Una tarea pausada también
  // vuelve a Assigned con historial y cumpliría la regla, así que la pausa manda.
  const isReopened =
    !isPaused &&
    ((phase === "Assigned" && actualStartTime != null) ||
      (phase === "InExecution" && (executionTime ?? 0) > 0));

  const plannedStartMs = plannedStartTime ? new Date(plannedStartTime).getTime() : NaN;
  const actualStartMs = actualStartTime ? new Date(actualStartTime).getTime() : NaN;

  const didStartLate = !isNaN(plannedStartMs) && !isNaN(actualStartMs) && actualStartMs > plannedStartMs;
  const delayTimeLabel = didStartLate ? calcDuration(plannedStartTime, actualStartTime) : null;

  const hasNotStarted = !actualStartTime;
  const canTick = hasNotStarted && actionablePhases.has(phase) && !isReopened && !isPaused;
  const now = useNow(canTick);

  const isRunningLate =
    !isPaused &&
    !isReopened &&
    hasNotStarted &&
    actionablePhases.has(phase) &&
    !isNaN(plannedStartMs) &&
    plannedStartMs < now;
  const startedLate =
    !isPaused &&
    !isReopened &&
    !hasNotStarted &&
    actionablePhases.has(phase) &&
    !isNaN(plannedStartMs) &&
    !isNaN(actualStartMs) &&
    actualStartMs > plannedStartMs;

  const isOverdue = isRunningLate || startedLate;
  const overdueLabel = isRunningLate
    ? formatOverdue(now - plannedStartMs)
    : startedLate
      ? formatOverdue(actualStartMs - plannedStartMs)
      : null;

  const startMutation = useMutation({
    mutationFn: async () => {
      // Cero del cronómetro: el instante del toque, antes de esperar a la API.
      const executionStartedAt = new Date().toISOString();
      const taskDetail = await startCleaningTask(id);
      return { taskDetail, executionStartedAt };
    },
    onSuccess: ({ taskDetail, executionStartedAt }) => {
      // El detalle guardado en caché quedó en la fase (y con el tiempo) previos al
      // arranque; sin esto la pantalla de ejecución los leería como vigentes.
      void queryClient.invalidateQueries({
        queryKey: ["cleaning-task-detail", id],
      });
      startTask({
        id,
        taskNumber,
        description,
        phase: taskDetail.phase ?? "InExecution",
        actualStartTime: taskDetail.actualStartTime ?? actualStartTime ?? executionStartedAt,
        executionStartedAt,
        // Ancla que acaba de registrar el backend: es la que hace que el conteo se
        // vea igual en cualquier ventana.
        sessionStartedAt: taskDetail.sessionStartedAt ?? null,
        // Reanudar continúa desde el tiempo guardado; reabrir arranca en cero. Lo
        // resuelve el backend al iniciar.
        sessionBaseMinutes: taskDetail.sessionBaseMinutes ?? (isPaused ? accumulatedMinutes : 0),
        // Base del total que se registrará, al margen de lo que marque el reloj.
        accumulatedMinutes: taskDetail.executionTime ?? accumulatedMinutes,
        plannedStartTime,
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
        sessionStartedAt,
        sessionBaseMinutes,
        accumulatedMinutes,
        plannedStartTime,
        plannedEndTime,
        unitDescription: unit?.description ?? description,
      });
      navigate(`/cleaning-tasks/${id}/execute`);
      return;
    }

    startMutation.mutate();
  };

  return (
    <div className="relative mt-6">
      <div
        className={`flex overflow-hidden rounded-xl bg-white shadow-sm ${isPaused
          ? "ring-1 ring-emerald-200"
          : isOverdue
            ? "ring-1 ring-orange-200"
            : ""
          }`}
      >
        {isPaused ? (
          <div className="flex w-7 flex-shrink-0 items-center justify-center bg-emerald-500">
            <span className="rotate-180 whitespace-nowrap text-[10px] font-bold tracking-wide text-white [writing-mode:vertical-lr]">
              EN PAUSA
            </span>
          </div>
        ) : isOverdue ? (
          <div className="flex w-7 flex-shrink-0 items-center justify-center bg-orange-500">
            <span className="rotate-180 whitespace-nowrap text-[10px] font-bold tracking-wide text-white [writing-mode:vertical-lr]">
              TAREA ATRASADA
            </span>
          </div>
        ) : (
          <div className="w-1 flex-shrink-0 bg-cyan-500" />
        )}
        <article className="min-w-0 flex-1 p-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">
                {description}
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                {taskNumber || "Sin Número de Tarea"}
              </h3>
            </div>

            <span
              className={`rounded-md px-2 py-1 text-xs font-medium ${isOverdue
                ? "border border-orange-300 bg-orange-100 text-orange-700"
                : "bg-slate-100 text-slate-600"
                }`}
            >
              {formatTaskDate(plannedStartTime)}
            </span>
          </div>

          {/* Phase badge */}
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-block ${getCleaningPhaseBadge(phase)}`}>
              {getCleaningPhaseLabel(phase)}
            </span>
            {isPaused && (
              <span className="flex-shrink-0 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                En pausa
              </span>
            )}
            {isReopened && (
              <span className="flex-shrink-0 rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                Reabierta
              </span>
            )}
          </div>

          {/* Body */}
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{unitLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>Inicio planeado: {formatTime(plannedStartTime)}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>Fin planeado: {formatTime(plannedEndTime)}</span>
            </div>

            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 flex-shrink-0" />
              <span>Duración estimada: {duration}</span>
            </div>
            {isPaused && !!workedLabel && (
              <div className="flex items-center gap-2">
                <PauseCircle className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                <span>Tiempo trabajado: {workedLabel}</span>
              </div>
            )}
            {didStartLate && !!delayTimeLabel && (
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 flex-shrink-0" />
                <span>Tarea con retraso de: {delayTimeLabel}</span>
              </div>
            )}
          </div>

          {/* Overdue warning */}
          {isOverdue && !!overdueLabel && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>
                {isRunningLate ? (
                  <>
                    Llevas <strong>{overdueLabel}</strong> con retraso
                  </>
                ) : (
                  <>
                    Empezaste con <strong>{overdueLabel}</strong> de retraso
                  </>
                )}
              </span>
            </div>
          )}

          {/* Footer */}
          {actionablePhases.has(phase) && (
            <div className="mt-4 flex justify-end">
              <button
                disabled={!isActionable}
                onClick={handleStart}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${isActionable
                  ? isPaused
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-brand text-white hover:bg-brand-hover"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
              >
                {isPaused
                  ? "Reanudar"
                  : isSameActiveTask || isTaskAlreadyInExecution
                    ? "Continuar"
                    : "Iniciar"}
              </button>
            </div>
          )}

        </article>
      </div>
      <LoadingModal
        open={startMutation.isPending}
        message={isPaused ? "Reanudando tarea..." : "Iniciando tarea..."}
      />
      <ErrorModal
        open={errorMessage !== null}
        title={isPaused ? "No se pudo reanudar la tarea" : "No se pudo iniciar la tarea"}
        message={
          errorMessage ??
          (isAnotherTaskActive
            ? `Ya tienes una tarea activa: ${activeTask?.taskNumber}`
            : "No se pudo iniciar la tarea")
        }
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
};
