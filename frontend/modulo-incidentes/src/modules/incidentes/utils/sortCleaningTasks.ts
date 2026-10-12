import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";

type Sortable = Pick<
  CleaningTask,
  | "id"
  | "phase"
  | "isPaused"
  | "plannedStartTime"
  | "actualStartTime"
  | "generatedDate"
>;

/**
 * Instante de referencia de una tarea: su inicio planificado; si no lo tiene, el
 * inicio real y, al final, cuándo se creó. Sin ninguna fecha válida va a 0, que
 * la deja al extremo "más antiguo".
 */
const startOf = (task: Sortable): number => {
  for (const value of [
    task.plannedStartTime,
    task.actualStartTime,
    task.generatedDate,
  ]) {
    const ms = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(ms)) return ms;
  }
  return 0;
};

/** Empate estable: la tarea más nueva (id mayor) primero. */
const byId = (a: Sortable, b: Sortable) => b.id - a.id;

/**
 * Orden para el operario: lo que está en ejecución o en pausa va primero y,
 * dentro de cada grupo, la de inicio más reciente arriba y la más antigua abajo.
 */
export const sortTasksForOperator = <T extends Sortable>(tasks: T[]): T[] => {
  const rank = (task: Sortable) =>
    task.phase === "InExecution" || task.isPaused ? 0 : 1;

  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || startOf(b) - startOf(a) || byId(a, b),
  );
};

/**
 * Orden para supervisión: primero lo por revisar (Completed) y al final lo ya
 * revisado (Reviewed); dentro de cada sección, la más antigua arriba.
 */
export const sortTasksForSupervision = <T extends Sortable>(
  tasks: T[],
): T[] => {
  const rank = (task: Sortable) =>
    task.phase === "Completed" ? 0 : task.phase === "Reviewed" ? 2 : 1;

  return [...tasks].sort(
    (a, b) => rank(a) - rank(b) || startOf(a) - startOf(b) || byId(a, b),
  );
};
