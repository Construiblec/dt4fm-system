import { useCallback, useState } from "react";
import { fetchAllCleaningTasks } from "@/modules/supervisor/services/supervisorService";
import type { PendingCleaningTask } from "@/modules/coordinador/types/Coordinador";

/**
 * "Pendientes por Asignar": tareas que la sincronización con Hostaway creó
 * automáticamente y quedaron en Assigned sin fecha planificada ni empleado.
 * Reusa el mismo endpoint que ya consume Supervisor (`GET /cleaning-tasks/all`,
 * ver `useSupervisorTasks.ts`), filtrando en cliente igual que ese hook filtra
 * por fase — acá no hace falta soporte server-side mientras el volumen sea
 * chico (unas pocas decenas de tareas por día).
 */
export const usePendingTasks = () => {
  const [tasks, setTasks] = useState<PendingCleaningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchAllCleaningTasks({
        phase: "Assigned",
        limit: 200,
      });
      const pending = response.data.filter(
        (task) => !task.plannedStartTime && !task.employee,
      ) as PendingCleaningTask[];
      setTasks(pending);
    } catch {
      setError("No se pudieron cargar las tareas pendientes");
    } finally {
      setLoading(false);
    }
  }, []);

  return { tasks, loading, error, load };
};
