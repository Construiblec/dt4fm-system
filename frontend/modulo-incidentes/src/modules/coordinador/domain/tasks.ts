/**
 * Reglas de la tarjeta de limpieza vistas por el coordinador. Funciones puras:
 * lo que dice cada estado, qué es una pendiente, qué está atrasado y cuándo se
 * superponen dos limpiezas.
 */
import type { StatusLevel } from "@/shared/constants/statusPalette";
import type { CoordTask } from "../types/Coordinador";
import { ymdOf } from "./dates";

type StatusKey =
  | "pending"
  | "assigned"
  | "paused"
  | "inProgress"
  | "review"
  | "done"
  | "cancelled";

export const STATUS: Record<StatusKey, { label: string; level: StatusLevel }> =
  {
    pending: { label: "Por asignar", level: "pending" },
    assigned: { label: "Asignada", level: "assigned" },
    paused: { label: "En pausa", level: "paused" },
    inProgress: { label: "En ejecución", level: "inProgress" },
    review: { label: "Completada", level: "review" },
    done: { label: "Revisada", level: "done" },
    cancelled: { label: "Cancelada", level: "cancelled" },
  };

type TaskLike = Pick<
  CoordTask,
  | "phase"
  | "isPaused"
  | "actualStartTime"
  | "executionTime"
  | "employee"
  | "plannedStartTime"
>;

/**
 * Misma regla que la tarjeta del operario: una tarea que vuelve a Assigned con
 * historial, o está en ejecución con tiempo ya acumulado, fue reabierta.
 */
export const isReopened = (task: TaskLike): boolean =>
  !task.isPaused &&
  ((task.phase === "Assigned" && task.actualStartTime != null) ||
    (task.phase === "InExecution" && (task.executionTime ?? 0) > 0));

/** Pendiente: asignada, sin empezar, sin pausa, y sin empleado o sin horario. La unidad no cuenta. */
export const isPending = (task: TaskLike): boolean =>
  task.phase === "Assigned" &&
  !task.isPaused &&
  !task.actualStartTime &&
  (!task.employee || !task.plannedStartTime);

export const isOverdue = (task: TaskLike, nowMs: number): boolean =>
  task.phase === "Assigned" &&
  !task.isPaused &&
  !isReopened(task) &&
  !task.actualStartTime &&
  Boolean(task.employee) &&
  Boolean(task.plannedStartTime) &&
  Date.parse(task.plannedStartTime as string) < nowMs;

export const overdueMinutes = (task: TaskLike, nowMs: number): number =>
  isOverdue(task, nowMs)
    ? Math.round((nowMs - Date.parse(task.plannedStartTime as string)) / 60_000)
    : 0;

/** El coordinador edita y cancela solo lo que no empezó. Es la misma regla que aplica el backend. */
export const canEdit = (task: TaskLike): boolean =>
  task.phase === "Assigned" && !task.isPaused && !task.actualStartTime;

export const statusKey = (task: TaskLike): StatusKey => {
  switch (task.phase) {
    case "Cancelled":
      return "cancelled";
    case "Reviewed":
      return "done";
    case "Completed":
      return "review";
    case "InExecution":
      return "inProgress";
    default:
      if (task.isPaused) return "paused";
      if (isPending(task)) return "pending";
      return "assigned";
  }
};

export const hasPlan = (
  task: Pick<CoordTask, "plannedStartTime" | "plannedEndTime">,
): boolean => Boolean(task.plannedStartTime && task.plannedEndTime);

const intervalsOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean =>
  Date.parse(aStart) < Date.parse(bEnd) &&
  Date.parse(bStart) < Date.parse(aEnd);

/** Limpiezas del mismo empleado que se cruzan con [start, end). */
export const conflictsFor = (
  employeeId: number | null,
  startIso: string | null,
  endIso: string | null,
  tasks: CoordTask[],
  excludeIds: number[] = [],
): CoordTask[] => {
  if (!employeeId || !startIso || !endIso) return [];

  return tasks.filter(
    (task) =>
      !excludeIds.includes(task.id) &&
      task.phase !== "Cancelled" &&
      task.employee?.id === employeeId &&
      hasPlan(task) &&
      intervalsOverlap(
        startIso,
        endIso,
        task.plannedStartTime as string,
        task.plannedEndTime as string,
      ),
  );
};

/** Mapa id → limpiezas con las que se superpone. Solo avisa: no hay máximo por empleado. */
export const findOverlaps = (tasks: CoordTask[]): Map<number, CoordTask[]> => {
  const map = new Map<number, CoordTask[]>();
  const active = tasks.filter(
    (task) => task.phase !== "Cancelled" && task.employee && hasPlan(task),
  );

  active.forEach((a, i) => {
    active.slice(i + 1).forEach((b) => {
      if (
        a.employee?.id === b.employee?.id &&
        intervalsOverlap(
          a.plannedStartTime as string,
          a.plannedEndTime as string,
          b.plannedStartTime as string,
          b.plannedEndTime as string,
        )
      ) {
        map.set(a.id, [...(map.get(a.id) ?? []), b]);
        map.set(b.id, [...(map.get(b.id) ?? []), a]);
      }
    });
  });

  return map;
};

/** Fecha de referencia de una limpieza: el checkout, o el día planificado, o cuando se creó. */
export const taskDate = (task: CoordTask): string =>
  task.checkoutDate ?? ymdOf(task.plannedStartTime) ?? task.generatedDate;

export type TeamLogEntry = {
  type: "pause" | "resume" | "restart" | "note";
  date?: string;
  time?: string;
  carryMinutes?: number | null;
  text: string;
};

/**
 * Bitácora del equipo (TeamObservations):
 *   [Pausado: 2026-08-19 | 10:20]: se acabó el detergente
 *   [Reanudado: 2026-08-19 | 10:34]
 *   [Reiniciado: 2026-08-19 | 10:34 | 25min]
 * El motivo de una pausa viene pegado a su marca.
 */
export const parseTeamLog = (
  text: string | null | undefined,
): TeamLogEntry[] => {
  const source = String(text ?? "");
  const pattern =
    /\[(Pausado|Reanudado|Reiniciado):\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(\d{1,2}:\d{2})(?:\s*\|\s*([\d.]+)\s*min)?\s*\](?::\s*)?/g;
  const entries: TeamLogEntry[] = [];
  let lastIndex = 0;
  let previous: TeamLogEntry | null = null;

  const pushText = (chunk: string) => {
    const clean = chunk.trim();
    if (!clean) return;
    if (previous && previous.type === "pause" && !previous.text) {
      previous.text = clean;
    } else {
      entries.push({ type: "note", text: clean });
    }
  };

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    pushText(source.slice(lastIndex, match.index));
    const type =
      match[1] === "Pausado"
        ? "pause"
        : match[1] === "Reanudado"
          ? "resume"
          : "restart";
    previous = {
      type,
      date: match[2],
      time: match[3].padStart(5, "0"),
      carryMinutes: match[4] ? Number(match[4]) : null,
      text: "",
    };
    entries.push(previous);
    lastIndex = pattern.lastIndex;
  }
  pushText(source.slice(lastIndex));

  return entries;
};
