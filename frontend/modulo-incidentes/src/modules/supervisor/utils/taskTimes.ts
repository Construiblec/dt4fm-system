export type TaskTimesInput = {
  plannedStartTime?: string | null;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  /** Tiempo trabajado acumulado, en minutos (double en OpenMAINT). */
  executionTime?: number | null;
};

const NONE = "—";

/** `45min`, `1h 5min`, `2d 3h`. */
const spell = (totalMinutes: number): string => {
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;

  if (d > 0) {
    let res = `${d}d`;
    if (h > 0) res += ` ${h}h`;
    if (m > 0) res += ` ${m}min`;
    return res;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
};

/** Lo que hay entre dos instantes; «—» si falta uno o la resta no es positiva. */
const between = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return NONE;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms <= 0 ? NONE : spell(Math.round(ms / 60_000));
};

const worked = (minutes?: number | null): string | null => {
  if (minutes == null) return null;
  const total = Math.round(minutes);
  return total <= 0 ? NONE : spell(total);
};

/**
 * Duración, retraso y orden de las fechas de una limpieza, tal como los
 * enseñaba la ficha del supervisor.
 *
 * - Duración: `ExecutionTime` es lo realmente trabajado, sumando todas las
 *   ejecuciones; la resta fin − inicio solo respalda a tareas antiguas que
 *   nunca lo registraron.
 * - Retraso: contra `PlannedStartTime`, sin depender del `DelayTime` guardado
 *   (ambas fechas se conservan al reabrir). Sin horario planificado no se puede
 *   afirmar que no hubo retraso, y eso se distingue de «Sin retraso».
 * - OpenMAINT acepta corregir a mano inicio y fin sin validar el orden, y así
 *   han entrado tareas con el fin antes del inicio. La duración no lo delata
 *   (sale de otra fuente): se avisa en pantalla en vez de corregir el dato.
 */
export const taskTimes = (times: TaskTimesInput) => {
  const { plannedStartTime, actualStartTime, actualEndTime, executionTime } =
    times;

  const delay = (() => {
    if (!plannedStartTime) return "Sin planificar";
    if (!actualStartTime) return NONE;
    const late = between(plannedStartTime, actualStartTime);
    return late === NONE ? "Sin retraso" : late;
  })();

  return {
    duration: worked(executionTime) ?? between(actualStartTime, actualEndTime),
    delay,
    endsBeforeStart:
      actualStartTime != null &&
      actualEndTime != null &&
      new Date(actualEndTime).getTime() < new Date(actualStartTime).getTime(),
  };
};
