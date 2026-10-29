import {
  CalendarDays,
  CircleCheck,
  Clock,
  Hourglass,
  MapPin,
  Play,
  Timer,
  UserRound,
} from "lucide-react";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import {
  formatElapsed,
  formatLate,
  formatMinutes,
} from "@/shared/utils/dateUtils";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { dateField, type WorkCardField } from "@/shared/utils/workCardFields";

export type CleaningPerspective = "operator" | "supervisor";

export type CleaningCardTask = Pick<
  CleaningTask,
  | "phase"
  | "description"
  | "unit"
  | "plannedStartTime"
  | "plannedEndTime"
  | "actualStartTime"
  | "actualEndTime"
  | "executionTime"
  | "isPaused"
>;

/** Fases en las que la tarea sigue pendiente de trabajo del operario. */
export const ACTIVE_CLEANING_PHASES = new Set(["Assigned", "InExecution"]);

/**
 * Se deduce de los datos, no de las observaciones: una tarea recién asignada
 * nunca trae `actualStartTime` (al reabrir se conserva el del primer inicio) y
 * `executionTime` solo existe tras una finalización previa. Una tarea pausada
 * también vuelve a Assigned con historial, así que la pausa manda.
 */
export const isCleaningReopened = (
  task: Pick<CleaningTask, "phase" | "actualStartTime" | "executionTime" | "isPaused">,
) =>
  !task.isPaused &&
  ((task.phase === "Assigned" && task.actualStartTime != null) ||
    (task.phase === "InExecution" && (task.executionTime ?? 0) > 0));

export type CleaningLateness = {
  /** `pending`: ya debió empezar y no lo hizo; `started`: empezó tarde */
  kind: "pending" | "started";
  ms: number;
};

export const getCleaningLateness = (
  task: CleaningCardTask,
  now: number,
): CleaningLateness | null => {
  if (
    !ACTIVE_CLEANING_PHASES.has(task.phase) ||
    task.isPaused ||
    isCleaningReopened(task)
  ) {
    return null;
  }

  const planned = task.plannedStartTime
    ? new Date(task.plannedStartTime).getTime()
    : NaN;
  if (Number.isNaN(planned)) return null;

  if (!task.actualStartTime) {
    return planned < now ? { kind: "pending", ms: now - planned } : null;
  }

  const actual = new Date(task.actualStartTime).getTime();
  return actual > planned ? { kind: "started", ms: actual - planned } : null;
};

export const cleaningNoticeText = (
  lateness: CleaningLateness,
  perspective: CleaningPerspective,
): string => {
  const late = formatLate(lateness.ms);
  if (lateness.kind === "pending") {
    return perspective === "operator"
      ? `Atrasada · Llevas ${late} de retraso`
      : `Atrasada · Debió iniciar hace ${late}`;
  }
  return perspective === "operator"
    ? `Atrasada · Empezaste con ${late} de retraso`
    : `Atrasada · Empezó con ${late} de retraso`;
};

/** Cada fase enseña solo las fechas y personas que importan en ese momento. */
export const cleaningFields = (
  task: CleaningCardTask & Partial<Pick<CleaningTask, "employee">>,
  perspective: CleaningPerspective,
): WorkCardField[] => {
  const location: WorkCardField = {
    icon: MapPin,
    label: "Ubicación",
    value: task.unit?.description ?? task.description,
  };
  const plannedStart = dateField(CalendarDays, "Inicio planeado", task.plannedStartTime);
  const plannedEnd = dateField(Clock, "Fin planeado", task.plannedEndTime);
  const actualStart = dateField(Play, "Inicio real", task.actualStartTime);
  const fields: WorkCardField[] = [location];

  if (perspective === "supervisor") {
    fields.push({
      icon: UserRound,
      label: "Responsable",
      value: formatEmployeeName(task.employee?.name),
    });
  }

  if (task.isPaused && perspective === "operator") {
    fields.push(actualStart, {
      icon: Hourglass,
      label: "Trabajado",
      value: formatMinutes(Math.round(Math.max(0, task.executionTime ?? 0))),
    });
    return fields;
  }

  switch (task.phase) {
    case "Assigned":
      fields.push(plannedStart, plannedEnd);
      if (perspective === "operator") {
        fields.push({
          icon: Timer,
          label: "Duración",
          value: `${formatElapsed(task.plannedStartTime, task.plannedEndTime) ?? "Sin dato"} estimada`,
        });
      }
      break;
    case "InExecution":
      fields.push(actualStart, plannedEnd);
      break;
    case "Completed":
    case "Reviewed": {
      const worked = task.executionTime ?? 0;
      fields.push(actualStart, dateField(CircleCheck, "Fin", task.actualEndTime), {
        icon: Timer,
        label: "Duración",
        value:
          worked > 0
            ? formatMinutes(Math.round(worked))
            : (formatElapsed(task.actualStartTime, task.actualEndTime) ?? "Sin dato"),
      });
      break;
    }
    default:
      fields.push(plannedStart);
  }

  return fields;
};
