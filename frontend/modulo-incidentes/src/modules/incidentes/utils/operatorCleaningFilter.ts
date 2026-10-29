import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";

type Filterable = Pick<
  CleaningTask,
  "phase" | "isPaused" | "plannedStartTime" | "checkoutDate" | "generatedDate"
>;

/** Fases que el operario ve en su lista; las revisadas y canceladas no. */
const VISIBLE_PHASES = ["Assigned", "InExecution", "Completed"];

/** Una fecha sin hora: `2026-10-14`. */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Día local (YYYY-MM-DD) de una fecha. Una sin hora se toma tal cual:
 * `new Date("2026-10-14")` es medianoche UTC, que en Ecuador cae el día anterior.
 */
export const localDay = (value: string | Date): string | null => {
  if (typeof value === "string" && YMD.test(value)) return value;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** `2026-10-28` y -1 → `2026-10-27`. A mediodía, para no saltar con un cambio de hora. */
export const shiftDay = (day: string, days: number): string => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d) ?? day;
};

/**
 * Día en que toca hacer la limpieza: el de su inicio planificado, el mismo con
 * el que la agenda del coordinador la reparte. Sin horario cae en el checkout y,
 * en último caso, en el día en que se creó.
 */
export const taskDay = (task: Filterable): string | null => {
  for (const value of [
    task.plannedStartTime,
    task.checkoutDate,
    task.generatedDate,
  ]) {
    const day = value ? localDay(value) : null;
    if (day) return day;
  }
  return null;
};

/** La está ejecutando o la dejó en pausa: hay que poder terminarla o reanudarla. */
export const isOngoing = (task: Filterable): boolean =>
  task.phase === "InExecution" || task.isPaused;

/**
 * Lo que ve el operario en su lista de limpiezas.
 *
 * - Fase: «Todas» (`ALL`) deja fuera las completadas, que solo salen al elegir
 *   «Completada». Una pausada sigue en `Assigned`, como en openMAINT.
 * - Día: las del día elegido. En hoy se suman, de cualquier día, las que están
 *   en ejecución o en pausa.
 */
export const filterOperatorTasks = <T extends Filterable>(
  tasks: T[],
  { phase, day, today }: { phase: string; day: string; today: string },
): T[] =>
  tasks.filter((task) => {
    if (!VISIBLE_PHASES.includes(task.phase)) return false;
    if (phase === "ALL" ? task.phase === "Completed" : task.phase !== phase) {
      return false;
    }
    return taskDay(task) === day || (day === today && isOngoing(task));
  });
