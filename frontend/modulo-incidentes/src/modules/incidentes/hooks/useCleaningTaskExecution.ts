import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { completeTaskSchema } from "@/modules/incidentes/schemas/cleaningTaskExecutionSchema";
import {
  completeCleaningTask,
  getAttachmentUrl,
  getCleaningTaskDetail,
} from "@/modules/incidentes/services/cleaningTaskExecutionService";
import type {
  ActiveCleaningTask,
  CleaningTaskAttachment,
  CleaningTaskExecutionDetail,
} from "@/modules/incidentes/types/CleaningTaskExecution";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";

const toActiveTask = (task: CleaningTaskExecutionDetail): ActiveCleaningTask => ({
  id: task.id,
  taskNumber: task.taskNumber,
  description: task.description,
  phase: task.phase,
  actualStartTime: task.actualStartTime ?? new Date().toISOString(),
  plannedStartTime: task.plannedStartTime,
  plannedEndTime: task.plannedEndTime,
  unitDescription: task.unit?.description ?? task.description,
});

const getPhotoFromAttachments = (attachments: CleaningTaskAttachment[]) =>
  attachments.find((attachment) => attachment.category === "Photo") ?? attachments[0];

export const useCleaningTaskExecution = (taskId: number) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const checklistProgress = useCleaningTaskExecutionStore((state) => state.checklistProgress);
  const observations = useCleaningTaskExecutionStore((state) => state.observations);
  const photoUploaded = useCleaningTaskExecutionStore((state) => state.photoUploaded);
  const photoUrl = useCleaningTaskExecutionStore((state) => state.photoUrl);
  const syncActiveTask = useCleaningTaskExecutionStore((state) => state.syncActiveTask);
  const initializeChecklist = useCleaningTaskExecutionStore((state) => state.initializeChecklist);
  const setObservations = useCleaningTaskExecutionStore((state) => state.setObservations);
  const setPhotoUploaded = useCleaningTaskExecutionStore((state) => state.setPhotoUploaded);
  const clearActiveTask = useCleaningTaskExecutionStore((state) => state.clearActiveTask);
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
    if (successOpen) {
      return;
    }

    const taskDetail = detailQuery.data;

    if (!taskDetail) {
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

    const totalActivities = taskDetail.checklistDetail?.activities.length ?? 0;
    initializeChecklist(totalActivities);

    if (!photoUploaded) {
      const photoAttachment = getPhotoFromAttachments(taskDetail.attachments);
      const resolvedPhotoUrl = getAttachmentUrl(photoAttachment);

      if (photoAttachment) {
        setPhotoUploaded(true, resolvedPhotoUrl);
      }
    }
  }, [
    activeTask?.actualStartTime,
    activeTask?.id,
    clearActiveTask,
    detailQuery.data,
    initializeChecklist,
    observations,
    photoUploaded,
    setObservations,
    setPhotoUploaded,
    successOpen,
    syncActiveTask,
  ]);

  const totalActivities = detailQuery.data?.checklistDetail?.activities.length ?? 0;
  const completedActivities = completedChecklistCountStore();
  const isChecklistComplete = isChecklistCompleteStore();
  const canComplete = canCompleteStore();

  const completeMutation = useMutation({
    mutationFn: async () => {
      const parsed = completeTaskSchema.safeParse({
        observations,
        checklistComplete: isChecklistCompleteStore(),
        photoUploaded,
      });

      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "No se puede completar la tarea");
      }

      return completeCleaningTask(taskId, parsed.data.observations ?? "");
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
    photoUploaded,
    photoUrl,
    totalActivities,
    completedActivities,
    isChecklistComplete,
    canComplete,
    validationMessage,
    isCompleting: completeMutation.isPending,
    successOpen,
    errorMessage,
    setSuccessOpen,
    setErrorMessage,
    completeTask: () => completeMutation.mutate(),
  };
};
