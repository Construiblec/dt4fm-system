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
  startTask: (task: ActiveCleaningTask) => void;
  syncActiveTask: (task: ActiveCleaningTask) => void;
  clearActiveTask: () => void;
  releaseActiveTask: () => void;
  initializeChecklist: (totalItems: number) => void;
  updateChecklistItem: (index: number, completed: boolean) => void;
  setObservations: (text: string) => void;
  isChecklistComplete: () => boolean;
  completedChecklistCount: () => number;
  canComplete: () => boolean;
};

// Las fotos no están aquí a propósito: viven en OpenMAINT y se leen del detalle
// de la tarea, así que sobreviven a la pausa, a la reapertura y al dispositivo.
const resetExecutionState = {
  contextTaskId: null as number | null,
  checklistProgress: {} as Record<number, boolean>,
  observations: "",
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
            activeTask: {
              ...task,
              // La tarjeta pasa el instante del toque en "Iniciar"; si faltara, el
              // cronómetro arranca ahora (nunca desde el inicio original).
              executionStartedAt: task.executionStartedAt ?? new Date().toISOString(),
              // Este arranque define el conteo: no se hereda nada de una sesión
              // anterior de la misma tarea.
              sessionStartedAt: task.sessionStartedAt ?? null,
              accumulatedMinutes: task.accumulatedMinutes ?? 0,
              sessionBaseMinutes: task.sessionBaseMinutes ?? 0,
            },
            contextTaskId: task.id,
            checklistProgress: shouldPreserveContext ? state.checklistProgress : {},
            observations: shouldPreserveContext ? state.observations : "",
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
            activeTask: {
              ...task,
              // Respaldo local del cero del cronómetro, solo por si el backend no
              // manda ancla. Al continuar una tarea ya iniciada se conserva la marca
              // original para no reiniciar el conteo.
              executionStartedAt:
                (shouldPreserveContext ? state.activeTask?.executionStartedAt : undefined) ??
                task.executionStartedAt ??
                new Date().toISOString(),
              // El ancla buena es la de OpenMAINT y siempre gana cuando llega: es la
              // única igual en todas las ventanas. Si esta lectura no la trae, se
              // conserva la que ya se tenía en vez de perderla.
              sessionStartedAt:
                task.sessionStartedAt ??
                (shouldPreserveContext ? state.activeTask?.sessionStartedAt : null) ??
                null,
              // El acumulado se refresca desde OpenMAINT (no cambia mientras la tarea
              // corre), pero nunca hacia abajo: un detalle servido de caché puede ser
              // anterior a la última pausa y borraría tiempo ya trabajado.
              accumulatedMinutes: Math.max(
                task.accumulatedMinutes ?? 0,
                shouldPreserveContext ? (state.activeTask?.accumulatedMinutes ?? 0) : 0,
              ),
              // Lo dicta el servidor: es lo que distingue reanudar (sigue contando)
              // de reabrir (vuelve a cero), y debe verse igual en toda ventana.
              sessionBaseMinutes:
                task.sessionBaseMinutes ??
                (shouldPreserveContext ? state.activeTask?.sessionBaseMinutes : 0) ??
                0,
            },
            contextTaskId: task.id,
            checklistProgress: shouldPreserveContext ? state.checklistProgress : {},
            observations: shouldPreserveContext ? state.observations : "",
          };
        }),
      clearActiveTask: () =>
        set({
          activeTask: null,
          ...resetExecutionState,
        }),
      // Al pausar la tarea deja de estar activa, pero el checklist, las
      // observaciones y la foto siguen ahí: reanudar debe continuar donde se quedó,
      // igual que el cronómetro. Solo se descartan si el empleado arranca otra tarea.
      releaseActiveTask: () => set({ activeTask: null }),
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
      }),
    },
  ),
);
