import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ActiveCleaningTask } from "@/modules/incidentes/types/CleaningTaskExecution";

const ACTIVE_TASK_PHASES = new Set(["InExecution", "InProgress"]);

export const isActiveCleaningTaskPhase = (phase?: string | null) =>
  Boolean(phase && ACTIVE_TASK_PHASES.has(phase));

type CleaningTaskExecutionState = {
  activeTask: ActiveCleaningTask | null;
  contextTaskId: number | null;
  checklistProgress: Record<number, boolean>;
  observations: string;
  photoUploaded: boolean;
  photoUrl?: string;
  startTask: (task: ActiveCleaningTask) => void;
  syncActiveTask: (task: ActiveCleaningTask) => void;
  clearActiveTask: () => void;
  initializeChecklist: (totalItems: number) => void;
  updateChecklistItem: (index: number, completed: boolean) => void;
  setObservations: (text: string) => void;
  setPhotoUploaded: (uploaded: boolean, url?: string) => void;
  isChecklistComplete: () => boolean;
  completedChecklistCount: () => number;
  canComplete: () => boolean;
};

const resetExecutionState = {
  contextTaskId: null as number | null,
  checklistProgress: {} as Record<number, boolean>,
  observations: "",
  photoUploaded: false,
  photoUrl: undefined as string | undefined,
};

export const useCleaningTaskExecutionStore = create<CleaningTaskExecutionState>()(
  persist(
    (set, get) => ({
      activeTask: null,
      ...resetExecutionState,
      startTask: (task) =>
        set((state) => {
          if (!isActiveCleaningTaskPhase(task.phase)) {
            return {
              activeTask: null,
              ...resetExecutionState,
            };
          }

          const shouldPreserveContext = state.contextTaskId === task.id;

          return {
            activeTask: task,
            contextTaskId: task.id,
            checklistProgress: shouldPreserveContext ? state.checklistProgress : {},
            observations: shouldPreserveContext ? state.observations : "",
            photoUploaded: shouldPreserveContext ? state.photoUploaded : false,
            photoUrl: shouldPreserveContext ? state.photoUrl : undefined,
          };
        }),
      syncActiveTask: (task) =>
        set((state) => {
          if (!isActiveCleaningTaskPhase(task.phase)) {
            return state.contextTaskId === task.id
              ? {
                  activeTask: null,
                  ...resetExecutionState,
                }
              : state;
          }

          const shouldPreserveContext = state.contextTaskId === task.id;

          return {
            activeTask: task,
            contextTaskId: task.id,
            checklistProgress: shouldPreserveContext ? state.checklistProgress : {},
            observations: shouldPreserveContext ? state.observations : "",
            photoUploaded: shouldPreserveContext ? state.photoUploaded : false,
            photoUrl: shouldPreserveContext ? state.photoUrl : undefined,
          };
        }),
      clearActiveTask: () =>
        set({
          activeTask: null,
          ...resetExecutionState,
        }),
      initializeChecklist: (totalItems) =>
        set((state) => {
          if (totalItems <= 0) {
            return { checklistProgress: {} };
          }

          const currentKeys = Object.keys(state.checklistProgress).length;
          if (currentKeys === totalItems) {
            return state;
          }

          const nextChecklist = Array.from({ length: totalItems }).reduce<Record<number, boolean>>(
            (accumulator, _, index) => {
              accumulator[index] = state.checklistProgress[index] ?? false;
              return accumulator;
            },
            {},
          );

          return { checklistProgress: nextChecklist };
        }),
      updateChecklistItem: (index, completed) =>
        set((state) => ({
          checklistProgress: {
            ...state.checklistProgress,
            [index]: completed,
          },
        })),
      setObservations: (text) => set({ observations: text }),
      setPhotoUploaded: (uploaded, url) =>
        set((state) => ({
          photoUploaded: uploaded,
          photoUrl: url ?? state.photoUrl,
        })),
      isChecklistComplete: () => {
        const values = Object.values(get().checklistProgress);
        return values.length > 0 && values.every(Boolean);
      },
      completedChecklistCount: () =>
        Object.values(get().checklistProgress).filter(Boolean).length,
      canComplete: () => get().isChecklistComplete(),
    }),
    {
      name: "cleaning-task-execution-storage",
      partialize: (state) => ({
        activeTask: state.activeTask,
        contextTaskId: state.contextTaskId,
        checklistProgress: state.checklistProgress,
        observations: state.observations,
        photoUploaded: state.photoUploaded,
        photoUrl: state.photoUrl,
      }),
    },
  ),
);
