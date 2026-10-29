import { formatReporter } from "@/shared/utils/reporterLabel";
import {
  CalendarDays,
  CircleCheck,
  MapPin,
  Play,
  Timer,
  UserRound,
  Wrench,
} from "lucide-react";
import {
  getCorrectiveStatusBar,
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import { toPriorityCode } from "@/shared/constants/priority";
import { LATE_START_STYLE } from "@/shared/constants/statusPalette";
import { useMinuteClock } from "@/shared/hooks/useMinuteClock";
import { formatElapsed, formatLate } from "@/shared/utils/dateUtils";
import { formatPlace } from "@/shared/utils/locationLabel";
import { PriorityPill, WorkCard } from "@/shared/components/WorkCard";
import { dateField, type WorkCardField } from "@/shared/utils/workCardFields";

export type ReporterKind = "staff" | "guest" | "visitor" | "iot";

/** Vista mínima de un correctivo para su tarjeta; cada módulo la adapta. */
export type CorrectiveCardData = {
  id: number;
  number: string | null;
  /** Breve descripción de la incidencia */
  subject: string | null;
  statusCode: string | null;
  status: string | null;
  site: string | null;
  floor: string | null;
  /** Unidad o área común */
  area: string | null;
  reporter: { name: string; kind: ReporterKind } | null;
  assignee: string | null;
  priorityCode: string | null;
  openingDate: string | null;
  plannedStart: string | null;
  execStartDate: string | null;
  execEndDate: string | null;
};

type Perspective = "supervisor" | "operator";

type Props = {
  data: CorrectiveCardData;
  /** Ruta del detalle; sin ella o con `disabledReason` la tarjeta no se abre */
  to?: string;
  /** El operador solo ve lo suyo: sin responsable y con el atraso en segunda persona */
  perspective: Perspective;
  disabledReason?: string | null;
  actionLabel?: string;
};

const NEW_STATUSES = new Set(["Opening", "Assignment"]);
const FINISHED_STATUSES = new Set(["Accounting", "Completed"]);

const locationOf = (data: CorrectiveCardData) =>
  formatPlace(data.site, data.area, data.floor) ?? "Sin ubicación";

/** Cada estado enseña solo las fechas y personas que importan en ese momento. */
const fieldsFor = (
  data: CorrectiveCardData,
  perspective: Perspective,
): WorkCardField[] => {
  const code = data.statusCode ?? "";
  const fields: WorkCardField[] = [
    { icon: MapPin, label: "Ubicación", value: locationOf(data) },
  ];
  const assignee: WorkCardField = {
    icon: Wrench,
    label: "Responsable",
    value: data.assignee ?? "Sin asignar",
  };

  if (NEW_STATUSES.has(code)) {
    if (data.reporter) {
      fields.push({
        icon: UserRound,
        label: "Reportado por",
        value: formatReporter(data.reporter) ?? "",
      });
    }
    fields.push(dateField(CalendarDays, "Reportado el", data.openingDate));
    return fields;
  }

  if (code === "Canceled") {
    fields.push(dateField(CalendarDays, "Reportado el", data.openingDate));
    return fields;
  }

  if (perspective === "supervisor") fields.push(assignee);

  if (code === "Assigned") {
    fields.push(dateField(CalendarDays, "Inicio previsto", data.plannedStart));
  } else if (code === "Execution") {
    fields.push(dateField(Play, "Inicio real", data.execStartDate));
  } else if (FINISHED_STATUSES.has(code)) {
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
  } else {
    fields.push(dateField(CalendarDays, "Reportado el", data.openingDate));
  }

  return fields;
};

/** Tarjeta de mantenimiento correctivo. */
export const CorrectiveCard = ({
  data,
  to,
  perspective,
  disabledReason = null,
  actionLabel,
}: Props) => {
  const code = data.statusCode ?? "";

  // Correctivo sin fecha límite: va atrasado si debía haber empezado y no lo hizo.
  const plannedMs = data.plannedStart
    ? new Date(data.plannedStart).getTime()
    : NaN;
  const mayBeLate =
    code === "Assigned" && !data.execStartDate && Number.isFinite(plannedMs);
  const now = useMinuteClock(mayBeLate);
  const lateMs = mayBeLate ? now - plannedMs : 0;
  const isLate = lateMs > 0;

  // Sin prioridad no hay píldora: puede faltar si quien reportó no la fijó.
  const priority = toPriorityCode(data.priorityCode);

  return (
    <WorkCard
      number={data.number ?? "Correctivo"}
      statusLabel={getCorrectiveStatusLabel(data.statusCode, data.status)}
      statusPill={getCorrectiveStatusPill(code)}
      bar={isLate ? LATE_START_STYLE.bar : getCorrectiveStatusBar(code)}
      title={data.subject?.trim() || "Sin descripción"}
      notice={
        isLate
          ? {
              tone: "late",
              text: `Atrasado · ${
                perspective === "operator"
                  ? `Llevas ${formatLate(lateMs)} de retraso`
                  : `Debió iniciar hace ${formatLate(lateMs)}`
              }`,
            }
          : null
      }
      fields={fieldsFor(data, perspective)}
      footerStart={priority ? <PriorityPill code={priority} /> : null}
      to={to}
      disabledReason={disabledReason}
      actionLabel={actionLabel}
    />
  );
};
