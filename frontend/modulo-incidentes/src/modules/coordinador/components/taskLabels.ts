import type { CoordEmployee, CoordTask, CoordUnit } from "../types/Coordinador";
import {
  formatDayShort,
  formatPersonName,
  formatRange,
  ymdOf,
} from "../domain/dates";

export const employeeName = (
  employee: CoordEmployee | null | undefined,
): string => (employee ? formatPersonName(employee.name) : "Sin asignar");

export const unitLabel = (unit: CoordUnit): string =>
  [unit.description, unit.building].filter(Boolean).join(" · ");

/** Dónde es la limpieza: la unidad, o el nombre de la descripción si no hay unidad. */
export const placeLabel = (task: CoordTask): string => {
  if (task.unit) return unitLabel(task.unit);
  return task.description?.replace(/^Limpieza - /, "") || "Sin unidad";
};

export const plannedLabel = (task: CoordTask): string => {
  if (!task.plannedStartTime) return "Sin horario";
  return `${formatDayShort(ymdOf(task.plannedStartTime))} · ${formatRange(task.plannedStartTime, task.plannedEndTime)}`;
};

/** Búsqueda sin mayúsculas ni tildes, palabra por palabra. */
export const fold = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const matchesSearch = (task: CoordTask, query: string): boolean => {
  if (!query.trim()) return true;
  const haystack = fold(
    [
      task.taskNumber,
      task.description,
      task.unit?.description,
      task.unit?.building,
      task.unit?.code,
      task.hostawayReservation,
      task.hostawayListingId,
    ].join(" "),
  );
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};
