import { useState, useCallback } from "react";
import { fetchAllCleaningTasks } from "@/modules/supervisor/services/supervisorService";
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
      const response = await fetchAllCleaningTasks(params);
      const allowedPhases = ["Completed", "Reviewed"];
      const filteredData = response.data.filter(t => allowedPhases.includes(t.phase));
      setTasks(filteredData);
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
