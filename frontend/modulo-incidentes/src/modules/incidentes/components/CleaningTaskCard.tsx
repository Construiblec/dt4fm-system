import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCleaningBlockedReason,
  getCleaningPhaseBar,
  getCleaningPhaseLabel,
  getCleaningPhasePill,
} from "@/modules/incidentes/constants/cleaningPhase";
import { ReopenedFlag } from "@/modules/incidentes/components/ReopenedFlag";
import { useStartCleaningTask } from "@/modules/incidentes/hooks/useStartCleaningTask";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import {
  ACTIVE_CLEANING_PHASES,
  cleaningFields,
  cleaningNoticeText,
  getCleaningLateness,
  isCleaningReopened,
} from "@/modules/incidentes/utils/cleaningCard";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { WorkCard } from "@/shared/components/WorkCard";
import {
  barClass,
  LATE_START_STYLE,
  pillClass,
} from "@/shared/constants/statusPalette";
import { useMinuteClock } from "@/shared/hooks/useMinuteClock";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";

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

export const CleaningTaskCard = (task: Props) => {
  const {
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
  } = task;
  const navigate = useNavigate();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const syncActiveTask = useCleaningTaskExecutionStore((state) => state.syncActiveTask);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSameActiveTask = activeTask?.id === id;
  const isTaskAlreadyInExecution = isActiveCleaningTaskPhase(phase);
  const isAnotherTaskActive = activeTask !== null && activeTask.id !== id;
  const isActionable = ACTIVE_CLEANING_PHASES.has(phase);

  /** Tiempo ya registrado en OpenMAINT: lo trabajado antes de la pausa. */
  const accumulatedMinutes = Math.max(0, executionTime ?? 0);

  const isReopened = isCleaningReopened(task);
  const mayBeLate = isActionable && !actualStartTime && !isPaused && !isReopened;
  const now = useMinuteClock(mayBeLate);
  const lateness = getCleaningLateness(task, now);

  const { start, isStarting, error: startError, clearError } = useStartCleaningTask({
    id,
    taskNumber,
    description,
    unitDescription: unit?.description ?? description,
    plannedStartTime,
    plannedEndTime,
    actualStartTime,
    accumulatedMinutes,
    isPaused,
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

    if (isPaused) {
      // Reanudar entra directo: el operario ya sabe de qué va la tarea y el
      // checklist conserva lo marcado. La pantalla previa sería un trámite.
      //
      // `justStarted` no es decorativo: al escribir el store cambia
      // `contextTaskId`, eso vuelve a disparar el efecto de reconciliación del
      // dashboard, y ese efecto —leyendo la lista vieja, donde la tarea sigue
      // pausada— suelta `activeTask` antes de que lleguemos a navegar. Sin este
      // aviso, la pantalla monta sin nada que le diga que la tarea ya arrancó y
      // muestra la vista previa hasta que vuelve el detalle.
      start(() =>
        navigate(`/cleaning-tasks/${id}/execute`, { state: { justStarted: true } }),
      );
      return;
    }

    // Una tarea que nunca arrancó solo se ABRE: nada de backend, nada de
    // cronómetro. El arranque lo decide el operario en la pantalla previa,
    // después de ver a qué se enfrenta.
    navigate(`/cleaning-tasks/${id}/execute`);
  };

  const disabledReason = !isActionable
    ? getCleaningBlockedReason(phase)
    : isAnotherTaskActive
      ? "Tienes otra tarea activa"
      : null;

  return (
    <>
      <WorkCard
        number={taskNumber || "Limpieza"}
        statusLabel={isPaused ? "En pausa" : getCleaningPhaseLabel(phase)}
        statusPill={isPaused ? pillClass("paused") : getCleaningPhasePill(phase)}
        bar={
          lateness
            ? LATE_START_STYLE.bar
            : isPaused
              ? barClass("paused")
              : getCleaningPhaseBar(phase)
        }
        title={description?.trim() || "Sin descripción"}
        notice={
          lateness
            ? { tone: "late", text: cleaningNoticeText(lateness, "operator") }
            : null
        }
        fields={cleaningFields(task, "operator")}
        footerStart={isReopened ? <ReopenedFlag /> : null}
        onOpen={handleStart}
        disabledReason={disabledReason}
        actionLabel={
          isPaused
            ? "Reanudar"
            : isSameActiveTask || isTaskAlreadyInExecution
              ? "Continuar"
              : "Abrir"
        }
      />
      {/* Solo la rama de reanudar espera al backend; abrir ya no llama a nadie. */}
      <LoadingModal open={isStarting} message="Reanudando tarea..." />
      <ErrorModal
        open={startError !== null || errorMessage !== null}
        title={isPaused ? "No se pudo reanudar la tarea" : "No se pudo iniciar la tarea"}
        message={
          startError ??
          errorMessage ??
          (isAnotherTaskActive
            ? `Ya tienes una tarea activa: ${activeTask?.taskNumber}`
            : "No se pudo iniciar la tarea")
        }
        onClose={() => {
          clearError();
          setErrorMessage(null);
        }}
      />
    </>
  );
};
