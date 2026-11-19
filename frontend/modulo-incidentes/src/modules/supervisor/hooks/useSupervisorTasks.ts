import { useState, useCallback, useEffect, useRef } from "react";
import { fetchAllCleaningTasks } from "@/modules/supervisor/services/supervisorService";
import { addDays, isoAt, todayYmd } from "@/modules/coordinador/domain/dates";
import { sortTasksForSupervision } from "@/modules/incidentes/utils/sortCleaningTasks";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import type { GetAllCleaningTasksParams } from "@/modules/supervisor/types/SupervisorTask";

type Filters = {
  phase: string;
  date: string;
  employeeId: string;
};

/** Fases del selector del panel; `""` es «Todas», como en `defaultFilters`. */
export const SUPERVISOR_PHASES = [
  { value: "", label: "Todas las fases" },
  { value: "Completed", label: "Completada" },
  { value: "Reviewed", label: "Revisada" },
];

/**
 * Al abrir: las limpiezas terminadas hoy, de cualquier fase. Se calcula al
 * abrir y no al cargar el módulo: la PWA puede quedar abierta de un día a otro.
 */
export const defaultFilters = (nowMs?: number): Filters => ({
  phase: "",
  date: todayYmd(nowMs),
  employeeId: "",
});

/** Cuántas limpiezas trae el panel. */
const PANEL_LIMIT = 200;

/**
 * Filtros → parámetros del listado. El día de fin va de las 00:00 a las 00:00
 * del siguiente, en hora de Ecuador (UTC−5): lo corta el navegador y no el
 * backend, para que el corte no se mueva cinco horas. Sin fecha no hay rango:
 * se ven todas (las más recientes).
 */
export const toParams = (filters: Filters): GetAllCleaningTasksParams => ({
  ...(filters.phase ? { phase: filters.phase } : {}),
  ...(filters.date
    ? {
        endedFrom: isoAt(filters.date, "00:00"),
        endedTo: isoAt(addDays(filters.date, 1), "00:00"),
      }
    : {}),
  ...(filters.employeeId ? { employeeId: Number(filters.employeeId) } : {}),
});

/** Completed y Reviewed: lo que ya terminó y se puede supervisar o consultar. */
export const isSupervisable = (task: CleaningTask) =>
  task.phase === "Completed" || task.phase === "Reviewed";

export const useSupervisorTasks = () => {
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  // Cambiar de día rápido deja varias peticiones en vuelo: solo vale la última.
  const lastRequest = useRef(0);

  const load = useCallback(async (next: Filters) => {
    const request = (lastRequest.current += 1);
    try {
      setLoading(true);
      setError(null);
      // Las recién creadas primero y con margen: con 50 sin orden, las
      // limpiezas nuevas podían quedar fuera del panel.
      const response = await fetchAllCleaningTasks({
        limit: PANEL_LIMIT,
        sort: "newest",
        ...toParams(next),
      });
      if (request !== lastRequest.current) return;
      const filteredData = response.data.filter(isSupervisable);
      // Por revisar primero y revisadas al final; en cada sección, la más antigua arriba.
      setTasks(sortTasksForSupervision(filteredData));
      setTotal(filteredData.length);
    } catch {
      if (request !== lastRequest.current) return;
      setError("No se pudieron cargar las tareas");
    } finally {
      if (request === lastRequest.current) setLoading(false);
    }
  }, []);

  // Primera carga con los filtros por defecto (hoy). Después, cada cambio de
  // filtro carga por su cuenta.
  useEffect(() => {
    void load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const applyFilters = useCallback(
    (newFilters: Partial<Filters>) => {
      const merged = { ...filters, ...newFilters };
      setFilters(merged);
      void load(merged);
    },
    [filters, load],
  );

  /** Vuelve al estado de apertura: hoy y todas las fases. */
  const clearFilters = useCallback(() => {
    const fresh = defaultFilters();
    setFilters(fresh);
    void load(fresh);
  }, [load]);

  return {
    tasks,
    loading,
    error,
    total,
    filters,
    applyFilters,
    clearFilters,
  };
};
