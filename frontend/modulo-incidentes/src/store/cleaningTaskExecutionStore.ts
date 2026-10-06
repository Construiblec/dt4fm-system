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
  /**
   * Huella de la plantilla a la que pertenece `checklistProgress`. Sin esto, dos
   * plantillas distintas con la misma cantidad de actividades comparten las
   * marcas: un tick afirma que una actividad concreta se hizo, así que heredarlo
   * de otra plantilla es dar por cumplido algo que nadie confirmó.
   */
  checklistSignature: string | null;
  /**
   * Solo tras migrar de la v0 (check por sección) a la v1 (check por actividad).
   * Queda fuera de `partialize` a propósito: vive en memoria, no se persiste, y
   * se apaga al primer tick.
   */
  progressResetByFormatChange: boolean;
  observations: string;
  startTask: (task: ActiveCleaningTask) => void;
  syncActiveTask: (task: ActiveCleaningTask) => void;
  clearActiveTask: () => void;
  releaseActiveTask: () => void;
  initializeChecklist: (totalItems: number, signature: string) => void;
  /** Una actividad suelta. Es por acá que el comando de voz va a confirmar. */
  updateChecklistItem: (index: number, completed: boolean) => void;
  /** Varias de una: el tap de un bloque marca o desmarca todas sus actividades. */
  setChecklistItems: (indices: number[], completed: boolean) => void;
  setObservations: (text: string) => void;
  isChecklistComplete: () => boolean;
  canComplete: () => boolean;
};

/** Lo que realmente se guarda en localStorage (ver `partialize`). */
type PersistedCleaningExecutionState = {
  activeTask: ActiveCleaningTask | null;
  contextTaskId: number | null;
  checklistProgress: Record<number, boolean>;
  checklistSignature: string | null;
  observations: string;
};

// Las fotos no están aquí a propósito: viven en OpenMAINT y se leen del detalle
// de la tarea, así que sobreviven a la pausa, a la reapertura y al dispositivo.
const resetExecutionState = {
  contextTaskId: null as number | null,
  checklistProgress: {} as Record<number, boolean>,
  checklistSignature: null as string | null,
  observations: "",
};

export const useCleaningTaskExecutionStore = create<CleaningTaskExecutionState>()(
  persist(
    (set, get) => ({
      activeTask: null,
      progressResetByFormatChange: false,
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
            // La firma viaja con el progreso: si sobrevive a un progreso que se
            // descartó, la plantilla siguiente parecería "la misma de antes".
            checklistSignature: shouldPreserveContext ? state.checklistSignature : null,
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
            // La firma viaja con el progreso: si sobrevive a un progreso que se
            // descartó, la plantilla siguiente parecería "la misma de antes".
            checklistSignature: shouldPreserveContext ? state.checklistSignature : null,
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
      initializeChecklist: (totalItems, signature) =>
        set((state) => {
          if (totalItems <= 0) {
            // Devolver el mismo estado cuando ya está vacío: si no, este efecto
            // crea un objeto nuevo en cada corrida y desestabiliza el selector.
            return Object.keys(state.checklistProgress).length === 0 &&
              state.checklistSignature === null
              ? state
              : { checklistProgress: {}, checklistSignature: null };
          }

          const signatureChanged = state.checklistSignature !== signature;
          const sizeMatches = Object.keys(state.checklistProgress).length === totalItems;

          if (!signatureChanged && sizeMatches) {
            return state;
          }

          const nextChecklist = Array.from({ length: totalItems }).reduce<Record<number, boolean>>(
            (accumulator, _, index) => {
              // Si la plantilla es otra, los índices guardados ya no significan lo
              // mismo y arrancan en falso. Si es la misma, se conserva lo marcado.
              accumulator[index] = signatureChanged
                ? false
                : (state.checklistProgress[index] ?? false);
              return accumulator;
            },
            {},
          );

          return { checklistProgress: nextChecklist, checklistSignature: signature };
        }),
      updateChecklistItem: (index, completed) =>
        set((state) => ({
          checklistProgress: {
            ...state.checklistProgress,
            [index]: completed,
          },
          // El primer tick ya es la respuesta al aviso: no hace falta cerrarlo.
          progressResetByFormatChange: false,
        })),
      // En un solo `set`: marcar un bloque de 16 actividades de a una dispararía
      // 16 renders y 16 escrituras a localStorage.
      setChecklistItems: (indices, completed) =>
        set((state) => {
          const checklistProgress = { ...state.checklistProgress };
          for (const index of indices) {
            checklistProgress[index] = completed;
          }

          return { checklistProgress, progressResetByFormatChange: false };
        }),
      setObservations: (text) => set({ observations: text }),
      isChecklistComplete: () => {
        const values = Object.values(get().checklistProgress);
        return values.length > 0 && values.every(Boolean);
      },
      canComplete: () => get().isChecklistComplete(),
    }),
    {
      name: "cleaning-task-execution-storage",
      // v1: `checklistProgress` pasó de indexarse por SECCIÓN a indexarse por
      // ACTIVIDAD, cuando el `Detalle` de openMAINT cambió a CSV.
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<PersistedCleaningExecutionState>;

        if (version === 1) {
          return state as PersistedCleaningExecutionState;
        }

        // Antes de v1 el índice 0 quería decir "la sección Dormitorio está lista";
        // ahora quiere decir "Separar la cama del espaldar está hecha". Remapear
        // significaría convertir un sí agregado en siete síes individuales, o sea
        // dar por confirmadas actividades que nadie confirmó: justo lo que este
        // cambio vino a evitar. Se descarta el avance y punto.
        //
        // No se pierde nada importante: el tiempo, las observaciones y las fotos
        // viven en openMAINT. Solo se caen las marcas locales del checklist, y el
        // cronómetro sigue corriendo porque `activeTask` se conserva.
        return {
          ...state,
          checklistProgress: {},
          checklistSignature: null,
          progressResetByFormatChange: true,
        } as PersistedCleaningExecutionState;
      },
      partialize: (state) => ({
        activeTask: state.activeTask,
        contextTaskId: state.contextTaskId,
        checklistProgress: state.checklistProgress,
        // Si esta línea falta, cada recarga parece un cambio de plantilla y borra
        // el progreso del operario.
        checklistSignature: state.checklistSignature,
        observations: state.observations,
      }),
    },
  ),
);
