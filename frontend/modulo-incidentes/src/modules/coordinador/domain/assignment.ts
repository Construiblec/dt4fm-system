/**
 * Reglas del panel de asignación múltiple: qué limpiezas se pueden repartir,
 * qué operadores se muestran y qué se manda al guardar la fecha, la hora y el
 * checklist de una limpieza ya asignada. Funciones puras.
 */
import type { CoordTask, EmployeeOption, UpdateTaskPayload } from "../types/Coordinador";
import { formatPersonName, hmOf, isoAt, sameInstant, ymdOf } from "./dates";
import { canEdit, taskDate } from "./tasks";

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-10-26` → «lun 26 oct». */
export const formatShortDay = (ymd: string): string => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** Se reparten las limpiezas que el coordinador todavía puede editar. */
export const assignableTasks = (tasks: CoordTask[]): CoordTask[] =>
  tasks.filter(canEdit);

export const unassignedTasks = (tasks: CoordTask[]): CoordTask[] =>
  assignableTasks(tasks)
    .filter((t) => !t.employee)
    .sort(
      (a, b) =>
        taskDate(a).localeCompare(taskDate(b)) ||
        a.taskNumber.localeCompare(b.taskNumber),
    );

export const tasksByEmployee = (tasks: CoordTask[]): Map<number, CoordTask[]> => {
  const map = new Map<number, CoordTask[]>();
  assignableTasks(tasks).forEach((t) => {
    if (!t.employee) return;
    map.set(t.employee.id, [...(map.get(t.employee.id) ?? []), t]);
  });
  map.forEach((list) =>
    list.sort(
      (a, b) =>
        (a.plannedStartTime ? Date.parse(a.plannedStartTime) : Infinity) -
          (b.plannedStartTime ? Date.parse(b.plannedStartTime) : Infinity) ||
        a.taskNumber.localeCompare(b.taskNumber),
    ),
  );
  return map;
};

export type EmployeeLimit = 4 | 6 | 8 | "all";

const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Operadores a mostrar: por nombre, filtrados por la búsqueda y recortados a `limit`. */
export const visibleEmployees = (
  employees: EmployeeOption[],
  query: string,
  limit: number | "all",
): { shown: EmployeeOption[]; total: number } => {
  const q = fold(query.trim());
  const matching = employees
    .filter((e) => !q || fold(formatPersonName(e.name)).includes(q))
    .sort((a, b) =>
      formatPersonName(a.name).localeCompare(formatPersonName(b.name), "es"),
    );
  return {
    shown: limit === "all" ? matching : matching.slice(0, limit),
    total: matching.length,
  };
};

/** Arrastrar una limpieza marcada lleva todas las marcadas; una sin marcar va sola. */
export const dragIds = (taskId: number, selected: Set<number>): number[] =>
  selected.has(taskId) ? [...selected] : [taskId];

export type PlanDraft = {
  date: string;
  start: string;
  end: string;
  checklistId: number | null;
};

export const draftFor = (task: CoordTask, today: string): PlanDraft => {
  const planned = ymdOf(task.plannedStartTime);
  const suggested = taskDate(task);
  return {
    date: planned ?? (suggested >= today ? suggested : today),
    start: hmOf(task.plannedStartTime) ?? "",
    end: hmOf(task.plannedEndTime) ?? "",
    checklistId: task.checklist?.id ?? null,
  };
};

export const isDirty = (draft: PlanDraft, task: CoordTask, today: string): boolean => {
  const base = draftFor(task, today);
  return (
    draft.start !== base.start ||
    draft.end !== base.end ||
    draft.checklistId !== base.checklistId ||
    (Boolean(task.plannedStartTime) && draft.date !== base.date)
  );
};

/** Lo que se manda al guardar, o el motivo por el que todavía no se puede. */
export const planPayload = (
  draft: PlanDraft,
  task: CoordTask,
): { payload: UpdateTaskPayload } | { error: string } => {
  const payload: UpdateTaskPayload = {};

  if (draft.start || draft.end) {
    if (!draft.date) return { error: "Elige la fecha de asignación." };
    if (!draft.start || !draft.end) {
      return { error: "Indica la hora de inicio y la de fin." };
    }
    if (draft.end <= draft.start) {
      return { error: "La hora de fin debe ser posterior a la de inicio." };
    }
    const startIso = isoAt(draft.date, draft.start);
    const endIso = isoAt(draft.date, draft.end);
    if (!sameInstant(startIso, task.plannedStartTime)) payload.plannedStartTime = startIso;
    if (!sameInstant(endIso, task.plannedEndTime)) payload.plannedEndTime = endIso;
  }

  if (draft.checklistId !== (task.checklist?.id ?? null)) {
    payload.cleaningChecklistId = draft.checklistId;
  }

  return Object.keys(payload).length
    ? { payload }
    : { error: "No hay cambios para guardar." };
};

/** Lo que muestra la fila cerrada: «lun 26 oct · 08:00», o `null` si falta. */
export const scheduleChip = (task: CoordTask): string | null => {
  const ymd = ymdOf(task.plannedStartTime);
  const hm = hmOf(task.plannedStartTime);
  return ymd && hm ? `${formatShortDay(ymd)} · ${hm}` : null;
};
