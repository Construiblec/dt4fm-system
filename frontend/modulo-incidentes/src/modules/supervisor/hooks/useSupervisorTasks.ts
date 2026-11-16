import { useState, useCallback } from "react";
import { fetchAllCleaningTasks } from "@/modules/supervisor/services/supervisorService";
import { sortTasksForSupervision } from "@/modules/incidentes/utils/sortCleaningTasks";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import type { GetAllCleaningTasksParams } from "@/modules/supervisor/types/SupervisorTask";

type Filters = {
  phase: string;
  employeeId: string;
};

const DEFAULT_FILTERS: Filters = {
  phase: "",
  employeeId: "",
};

/** Cuántas limpiezas trae el panel. */
const PANEL_LIMIT = 200;

/** El panel solo lista lo que terminó en estos días (ventana móvil, sin selector de fecha). */
export const PANEL_WINDOW_DAYS = 7;

/** Completed y Reviewed: lo que ya terminó y se puede supervisar o consultar. */
export const isSupervisable = (task: CleaningTask) =>
  task.phase === "Completed" || task.phase === "Reviewed";

export const useSupervisorTasks = () => {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const load = useCallback(async (params: GetAllCleaningTasksParams = {}) => {
    try {
      setLoading(true);
      setError(null);
      // Las recién creadas primero y con margen: con 50 sin orden, las
      // limpiezas nuevas podían quedar fuera del panel. `endedFrom` filtra en
      // openMAINT por la fecha de fin, para que el tope no recorte la ventana.
      const response = await fetchAllCleaningTasks({
        limit: PANEL_LIMIT,
        sort: "newest",
        endedFrom: new Date(
          Date.now() - PANEL_WINDOW_DAYS * 86_400_000,
        ).toISOString(),
        ...params,
      });
      const filteredData = response.data.filter(isSupervisable);
      // Por revisar primero y revisadas al final; en cada sección, la más antigua arriba.
      setTasks(sortTasksForSupervision(filteredData));
      setTotal(filteredData.length);
    } catch {
      setError("No se pudieron cargar las tareas");
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilters = useCallback(
    (newFilters: Partial<Filters>) => {
      const merged = { ...filters, ...newFilters };
      setFilters(merged);

      const params: GetAllCleaningTasksParams = {};
      if (merged.phase) params.phase = merged.phase;
      if (merged.employeeId) params.employeeId = Number(merged.employeeId);

      void load(params);
    },
    [filters, load],
  );

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    void load({});
  }, [load]);

  return {
    tasks,
    loading,
    error,
    total,
    filters,
    load,
    applyFilters,
    clearFilters,
  };
};
