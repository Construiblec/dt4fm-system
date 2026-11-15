import { useState, useCallback } from "react";
import { fetchAllCleaningTasks } from "@/modules/supervisor/services/supervisorService";
import { sortTasksForSupervision } from "@/modules/incidentes/utils/sortCleaningTasks";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import type { GetAllCleaningTasksParams } from "@/modules/supervisor/types/SupervisorTask";

type Filters = {
  phase: string;
  date: string;
  employeeId: string;
};

const DEFAULT_FILTERS: Filters = {
  phase: "",
  date: "",
  employeeId: "",
};

/** Cuántas limpiezas trae el panel. */
const PANEL_LIMIT = 200;

/**
 * Completed y Reviewed, salvo las `Completed` anteriores al corte de la
 * supervisión: quedan así, sin supervisión, y no se listan.
 */
export const isSupervisable = (task: CleaningTask) => {
  if (task.phase === "Reviewed") return true;
  if (task.phase !== "Completed") return false;
  // Un backend anterior no manda estos campos: entonces se lista como antes.
  if (task.supervisionEligible === undefined) return true;
  return Boolean(task.supervision) || task.supervisionEligible;
};

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
      // limpiezas nuevas podían quedar fuera del panel.
      const response = await fetchAllCleaningTasks({
        limit: PANEL_LIMIT,
        sort: "newest",
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
      if (merged.date) params.date = merged.date;
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
