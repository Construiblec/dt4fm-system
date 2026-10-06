import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startCleaningTask } from "@/modules/incidentes/services/cleaningTaskExecutionService";
import { unlockSpeechSynthesis } from "@/modules/incidentes/utils/speechUnlock";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";

/**
 * Lo mínimo que hace falta para poner una tarea en ejecución. La tarjeta lo saca
 * de la fila del listado y la pantalla previa del detalle: son dos formas
 * distintas del mismo dato, así que se pide aplanado.
 */
export type StartableCleaningTask = {
  id: number;
  taskNumber: string;
  description: string;
  unitDescription: string;
  plannedStartTime: string;
  plannedEndTime: string;
  /** Respaldos locales, por si el backend no los devuelve. */
  actualStartTime?: string | null;
  accumulatedMinutes?: number;
  isPaused?: boolean;
};

/**
 * Pone una tarea en ejecución y deja el cronómetro anclado donde corresponde.
 *
 * Existe como hook compartido y no copiado en cada pantalla porque acá adentro
 * se resuelven los tres anclajes del tiempo —`executionStartedAt`,
 * `sessionStartedAt` y `sessionBaseMinutes`—, y dos copias que se desincronicen
 * no fallan de forma visible: registran tiempo mal, en silencio.
 *
 * No navega a propósito: la tarjeta necesita ir a la pantalla de ejecución
 * después de arrancar, y la pantalla previa ya está ahí y solo cambia de vista.
 */
export const useStartCleaningTask = (task: StartableCleaningTask) => {
  const queryClient = useQueryClient();
  const startTask = useCleaningTaskExecutionStore((state) => state.startTask);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Cero del cronómetro: el instante del toque, antes de esperar a la API,
      // para que el viaje de red no se le cobre al operario. Es solo el
      // respaldo — si el backend devuelve su ancla, esa manda.
      const executionStartedAt = new Date().toISOString();
      const taskDetail = await startCleaningTask(task.id);
      return { taskDetail, executionStartedAt };
    },
    onSuccess: ({ taskDetail, executionStartedAt }) => {
      // El detalle en caché quedó en la fase (y con el tiempo) previos al
      // arranque; sin esto la pantalla de ejecución los leería como vigentes.
      void queryClient.invalidateQueries({
        queryKey: ["cleaning-task-detail", task.id],
      });

      startTask({
        id: task.id,
        taskNumber: task.taskNumber,
        description: task.description,
        phase: taskDetail.phase ?? "InExecution",
        actualStartTime:
          taskDetail.actualStartTime ?? task.actualStartTime ?? executionStartedAt,
        executionStartedAt,
        // Ancla que acaba de registrar el backend: es la que hace que el conteo
        // se vea igual en cualquier ventana y en cualquier dispositivo.
        sessionStartedAt: taskDetail.sessionStartedAt ?? null,
        // Reanudar continúa desde el tiempo guardado; reabrir arranca en cero.
        // Lo resuelve el backend al iniciar.
        sessionBaseMinutes:
          taskDetail.sessionBaseMinutes ??
          (task.isPaused ? (task.accumulatedMinutes ?? 0) : 0),
        // Base del total que se registrará, al margen de lo que marque el reloj.
        accumulatedMinutes: taskDetail.executionTime ?? task.accumulatedMinutes ?? 0,
        plannedStartTime: task.plannedStartTime,
        plannedEndTime: task.plannedEndTime,
        unitDescription: task.unitDescription,
      });
    },
    onError: (mutationError) => {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo iniciar la tarea de limpieza",
      );
    },
  });

  return {
    /**
     * `onStarted` corre DESPUÉS de que el store quedó escrito: quien navegue
     * desde ahí ya encuentra la tarea activa, sin un render intermedio en el
     * que la pantalla todavía la cree sin arrancar.
     */
    start: (onStarted?: () => void) => {
      // Tiene que ser lo primero, y síncrono: este `start()` corre dentro del
      // propio handler del tap ("Iniciar tarea" / "Reanudar"), que es la única
      // oportunidad real de destrabar la síntesis de voz en iOS. El asistente
      // habla recién después de que esta mutación viaje por red y de un
      // `setTimeout` interno — ya sin nada del gesto original —, así que
      // hacerlo ahí llegaría tarde.
      unlockSpeechSynthesis();
      mutation.mutate(undefined, { onSuccess: () => onStarted?.() });
    },
    isStarting: mutation.isPending,
    error,
    clearError: () => setError(null),
  };
};
