import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { completeTaskSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import {
  completeCleaningTask,
  getCleaningTaskDetail,
  pauseCleaningTask,
} from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type {
  ActiveCleaningTask,
  CleaningTaskExecutionDetail,
} from "@/modules/incidentes/types/CleaningTaskExecution";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";
import { getCheckableActivitiesCount } from "@/modules/incidentes/utils/cleaningChecklistUtils";

const toActiveTask = (task: CleaningTaskExecutionDetail): ActiveCleaningTask => ({
  id: task.id,
  taskNumber: task.taskNumber,
  description: task.description,
  phase: task.phase,
  actualStartTime: task.actualStartTime ?? new Date().toISOString(),
  // Lo que OpenMAINT ya tiene registrado: mientras la tarea corre nadie lo toca, así
  // que releerlo del detalle mantiene sana la base del total aunque se recargue.
  accumulatedMinutes: task.executionTime ?? 0,
  sessionStartedAt: task.sessionStartedAt ?? null,
  sessionBaseMinutes: task.sessionBaseMinutes ?? 0,
  plannedStartTime: task.plannedStartTime,
  plannedEndTime: task.plannedEndTime,
  unitDescription: task.unit?.description ?? task.description,
});

export const useCleaningTaskExecution = (taskId: number) => {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseSuccessOpen, setPauseSuccessOpen] = useState(false);
  // El borrador guardado en OpenMAINT se recupera una sola vez al entrar: después
  // manda lo que el empleado esté escribiendo, incluso si vacía el campo.
  const draftRestoredRef = useRef(false);
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const checklistProgress = useCleaningTaskExecutionStore((state) => state.checklistProgress);
  const observations = useCleaningTaskExecutionStore((state) => state.observations);
  const syncActiveTask = useCleaningTaskExecutionStore((state) => state.syncActiveTask);
  const initializeChecklist = useCleaningTaskExecutionStore((state) => state.initializeChecklist);
  const setObservations = useCleaningTaskExecutionStore((state) => state.setObservations);
  const clearActiveTask = useCleaningTaskExecutionStore((state) => state.clearActiveTask);
  const releaseActiveTask = useCleaningTaskExecutionStore((state) => state.releaseActiveTask);
  const canCompleteStore = useCleaningTaskExecutionStore((state) => state.canComplete);
  const completedChecklistCountStore = useCleaningTaskExecutionStore(
    (state) => state.completedChecklistCount,
  );
  const isChecklistCompleteStore = useCleaningTaskExecutionStore(
    (state) => state.isChecklistComplete,
  );

  const detailQuery = useQuery({
    queryKey: ["cleaning-task-detail", taskId],
    queryFn: () => getCleaningTaskDetail(taskId),
    staleTime: 5 * 60 * 1000,
    enabled: Number.isFinite(taskId) && taskId > 0,
  });

  useEffect(() => {
    if (successOpen || pauseSuccessOpen) {
      return;
    }

    const taskDetail = detailQuery.data;

    if (!taskDetail) {
      return;
    }

    // Un detalle servido de caché puede ser anterior a este arranque: el que quedó
    // guardado al pausar dice "Assigned" y haría descartar la tarea que se acaba de
    // reanudar (con su checklist y su cronómetro). Se espera al refetch.
    const sessionStartedAt = activeTask?.executionStartedAt
      ? new Date(activeTask.executionStartedAt).getTime()
      : 0;
    if (
      detailQuery.dataUpdatedAt > 0 &&
      detailQuery.dataUpdatedAt < sessionStartedAt
    ) {
      return;
    }

    if (!isActiveCleaningTaskPhase(taskDetail.phase) && activeTask?.id === taskDetail.id) {
      clearActiveTask();
      return;
    }

    const nextActiveTask = toActiveTask(taskDetail);
    syncActiveTask(
      activeTask?.id === taskDetail.id
        ? {
            ...nextActiveTask,
            actualStartTime: activeTask.actualStartTime || nextActiveTask.actualStartTime,
          }
        : nextActiveTask,
    );

    const totalActivities = taskDetail.checklistDetail
      ? getCheckableActivitiesCount(taskDetail.checklistDetail.activities)
      : 0;
    initializeChecklist(totalActivities);

    // Borrador que quedó guardado al pausar: vuelve al campo de escritura. Solo
    // se recupera si no hay ya texto local, para no pisar lo que el empleado
    // acabe de escribir en esta pantalla.
    if (!draftRestoredRef.current) {
      draftRestoredRef.current = true;

      if (taskDetail.draftObservations && !observations) {
        setObservations(taskDetail.draftObservations);
      }
    }
  }, [
    activeTask?.actualStartTime,
    activeTask?.executionStartedAt,
    activeTask?.id,
    clearActiveTask,
    detailQuery.data,
    detailQuery.dataUpdatedAt,
    initializeChecklist,
    observations,
    pauseSuccessOpen,
    setObservations,
    successOpen,
    syncActiveTask,
  ]);

  /**
   * Tiempo TOTAL trabajado en la tarea, en minutos: el acumulado con el que arrancó
   * esta sesión más lo que lleva el cronómetro. Es lo que el backend escribe en
   * ExecutionTime, reemplazando el valor anterior en vez de sumarse a él.
   */
  const resolveTotalExecutionMinutes = () => {
    const accumulated = Math.max(0, activeTask?.accumulatedMinutes ?? 0);
    // El mismo cero que muestra el cronómetro, para que lo registrado y lo que vio
    // el empleado sean el mismo número.
    const startedAt =
      activeTask?.sessionStartedAt ?? activeTask?.executionStartedAt;

    if (!startedAt) {
      // Sin cronómetro no hay nada que aportar; se deja que el backend conserve
      // lo que ya tenía registrado.
      return undefined;
    }

    const elapsedMinutes = Math.max(
      0,
      (Date.now() - new Date(startedAt).getTime()) / 60_000,
    );
    return accumulated + elapsedMinutes;
  };

  const totalActivities = detailQuery.data?.checklistDetail
    ? getCheckableActivitiesCount(detailQuery.data.checklistDetail.activities)
    : 0;
  const completedActivities = completedChecklistCountStore();
  const isChecklistComplete = isChecklistCompleteStore();
  const canComplete = canCompleteStore();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const parsed = completeTaskSchema.safeParse({
        observations,
        checklistComplete: isChecklistCompleteStore(),
      });

      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "No se puede completar la tarea");
      }

      return completeCleaningTask(
        taskId,
        parsed.data.observations ?? "",
        resolveTotalExecutionMinutes(),
      );
    },
    onSuccess: () => {
      setSuccessOpen(true);
      clearActiveTask();
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "No se pudo finalizar la tarea";
      setErrorMessage(message);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (reason: string) => {
      const trimmedReason = reason.trim();

      if (!trimmedReason) {
        throw new Error("Debes indicar el motivo de la pausa");
      }

      // Las observaciones a medio escribir viajan como borrador: OpenMAINT las
      // guarda entre llaves, sin mostrarlas, y vuelven al campo al reanudar.
      return pauseCleaningTask(
        taskId,
        trimmedReason,
        resolveTotalExecutionMinutes(),
        observations,
      );
    },
    onSuccess: () => {
      // El detalle en caché sigue diciendo "en ejecución" y con el tiempo anterior:
      // al reanudar hay que releerlo de OpenMAINT.
      void queryClient.invalidateQueries({
        queryKey: ["cleaning-task-detail", taskId],
      });
      setPauseModalOpen(false);
      setPauseSuccessOpen(true);
      // A diferencia de finalizar, aquí no se descarta el avance local: al reanudar
      // el empleado retoma el checklist y la evidencia donde los dejó.
      releaseActiveTask();
    },
    onError: (error) => {
      setPauseModalOpen(false);
      setErrorMessage(
        error instanceof Error ? error.message : "No se pudo pausar la tarea",
      );
    },
  });

  const validationMessage = useMemo(() => {
    if (!isChecklistComplete) {
      return `Completa todas las actividades del checklist (${completedActivities}/${totalActivities} completadas)`;
    }

    return null;
  }, [completedActivities, isChecklistComplete, totalActivities]);

  return {
    taskDetail: detailQuery.data,
    isLoading: detailQuery.isLoading,
    isFetching: detailQuery.isFetching,
    loadError:
      detailQuery.error instanceof Error
        ? detailQuery.error.message
        : detailQuery.error
          ? "No se pudo cargar el detalle de la tarea"
          : null,
    checklistProgress,
    observations,
    attachments: detailQuery.data?.attachments ?? [],
    totalActivities,
    completedActivities,
    isChecklistComplete,
    canComplete,
    validationMessage,
    isCompleting: completeMutation.isPending,
    // La fase manda: el flag del backend es solo una confirmación cuando viene.
    // Colgar el botón únicamente de canPause lo dejaba invisible contra un backend
    // que todavía no expone el campo.
    canPause: Boolean(
      detailQuery.data?.canPause ??
        isActiveCleaningTaskPhase(detailQuery.data?.phase),
    ),
    isPausing: pauseMutation.isPending,
    pauseModalOpen,
    pauseSuccessOpen,
    successOpen,
    errorMessage,
    setSuccessOpen,
    setPauseModalOpen,
    setPauseSuccessOpen,
    setErrorMessage,
    completeTask: () => completeMutation.mutate(),
    pauseTask: (reason: string) => pauseMutation.mutate(reason),
  };
};
