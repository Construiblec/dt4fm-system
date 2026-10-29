import {
  CalendarDays,
  CircleCheck,
  CirclePause,
  Clock,
  MapPin,
  Play,
  Timer,
  UserRound,
  Wrench,
} from "lucide-react";
import type { MaintenanceCardData } from "@/shared/components/MaintenanceCard";
import { formatElapsed, formatLate } from "@/shared/utils/dateUtils";
import { dateField, type WorkCardField } from "@/shared/utils/workCardFields";

export type PreventivePerspective = "operator" | "supervisor";

/** Cada estado enseña solo las fechas que importan; las que no tienen valor se omiten. */
export const preventiveFields = (
  data: MaintenanceCardData,
  perspective: PreventivePerspective,
): WorkCardField[] => {
  const fields: WorkCardField[] = [];
  if (data.target) {
    fields.push({ icon: Wrench, label: "Equipo", value: data.target });
  }
  fields.push({ icon: MapPin, label: "Ubicación", value: data.site ?? "Sin sitio" });
  if (perspective === "supervisor") {
    fields.push({
      icon: UserRound,
      label: "Responsable",
      value: data.assignee ?? "Sin asignar",
    });
  }

  const planned = data.plannedStart
    ? [dateField(CalendarDays, "Inicio previsto", data.plannedStart)]
    : [];
  const due = data.dueDate
    ? [dateField(Clock, "Fecha límite", data.dueDate)]
    : [];

  switch (data.statusCode) {
    case "Execution":
      fields.push(dateField(Play, "Inicio real", data.execStartDate), ...due);
      break;
    case "Completed":
      fields.push(
        dateField(Play, "Inicio real", data.execStartDate),
        dateField(CircleCheck, "Fin", data.execEndDate),
        {
          icon: Timer,
          label: "Duración",
          value:
            formatElapsed(data.execStartDate, data.execEndDate) ?? "Sin dato",
        },
      );
      break;
    case "Canceled":
      fields.push(...planned);
      break;
    case "Suspension":
      fields.push(
        ...(data.suspensionReason
          ? [{ icon: CirclePause, label: "Motivo", value: data.suspensionReason }]
          : planned),
        ...due,
      );
      break;
    default:
      fields.push(...planned, ...due);
  }

  return fields;
};

export const preventiveNoticeText = (
  data: MaintenanceCardData,
  now: number,
): string | null => {
  if (!data.isOverdue) return null;
  const due = data.dueDate ? new Date(data.dueDate).getTime() : NaN;
  return Number.isFinite(due) && now > due
    ? `Vencido · Venció hace ${formatLate(now - due)}`
    : "Vencido";
};
