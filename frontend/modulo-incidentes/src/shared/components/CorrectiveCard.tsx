import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Lock,
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
import {
  PRIORITY_DOT_CLASSES,
  PRIORITY_PHRASES,
  toPriorityCode,
} from "@/shared/constants/priority";
import { LATE_START_STYLE } from "@/shared/constants/statusPalette";
import { formatElapsed, formatDayMonthYearTime } from "@/shared/utils/dateUtils";
import { formatPlace } from "@/shared/utils/locationLabel";

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

type Field = {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  dateTime?: string;
};

const NEW_STATUSES = new Set(["Opening", "Assignment"]);
const FINISHED_STATUSES = new Set(["Accounting", "Completed"]);

const REPORTER_SUFFIX: Partial<Record<ReporterKind, string>> = {
  guest: " (huésped)",
  visitor: " (visitante)",
};

const locationOf = (data: CorrectiveCardData) =>
  formatPlace(data.site, data.area, data.floor) ?? "Sin ubicación";

/** Atraso en unidades gruesas: «35 min», «18 h», «2 d 4 h». */
const formatLate = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const rest = hours % 24;
  return `${Math.floor(hours / 24)} d${rest ? ` ${rest} h` : ""}`;
};

/** Reloj de minuto; solo corre mientras el atraso puede cambiar. */
const useMinuteClock = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
};

const dateField = (
  icon: Field["icon"],
  label: string,
  value: string | null,
): Field => ({
  icon,
  label,
  value: formatDayMonthYearTime(value, "Sin fecha"),
  dateTime: value ?? undefined,
});

/** Cada estado enseña solo las fechas y personas que importan en ese momento. */
const fieldsFor = (data: CorrectiveCardData, perspective: Perspective): Field[] => {
  const code = data.statusCode ?? "";
  const fields: Field[] = [{ icon: MapPin, label: "Ubicación", value: locationOf(data) }];
  const assignee: Field = {
    icon: Wrench,
    label: "Responsable",
    value: data.assignee ?? "Sin asignar",
  };

  if (NEW_STATUSES.has(code)) {
    if (data.reporter) {
      fields.push({
        icon: UserRound,
        label: "Reportado por",
        value: data.reporter.name + (REPORTER_SUFFIX[data.reporter.kind] ?? ""),
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
        value: formatElapsed(data.execStartDate, data.execEndDate) ?? "Sin dato",
      },
    );
  } else {
    fields.push(dateField(CalendarDays, "Reportado el", data.openingDate));
  }

  return fields;
};

/**
 * Tarjeta de mantenimiento correctivo (diseño H): toda la tarjeta abre el
 * detalle mediante un enlace estirado sobre el título, así el nombre accesible
 * del enlace es la incidencia y el resto se lee como contenido.
 */
export const CorrectiveCard = ({
  data,
  to,
  perspective,
  disabledReason = null,
  actionLabel = "Ver detalle",
}: Props) => {
  const code = data.statusCode ?? "";
  const canOpen = Boolean(to) && !disabledReason;

  // Correctivo sin fecha límite: va atrasado si debía haber empezado y no lo hizo.
  const plannedMs = data.plannedStart ? new Date(data.plannedStart).getTime() : NaN;
  const mayBeLate = code === "Assigned" && !data.execStartDate && Number.isFinite(plannedMs);
  const now = useMinuteClock(mayBeLate);
  const lateMs = mayBeLate ? now - plannedMs : 0;
  const isLate = lateMs > 0;

  // Sin prioridad no hay píldora: puede faltar si quien reportó no la fijó.
  const priority = toPriorityCode(data.priorityCode);
  const title = data.subject?.trim() || "Sin descripción";

  return (
    <article
      className={`relative overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm ${
        canOpen
          ? "transition hover:border-slate-400 hover:shadow-md active:border-slate-400 active:bg-slate-50 active:shadow-none has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-blue-600 has-[a:focus-visible]:ring-offset-2 motion-reduce:transition-none"
          : ""
      }`}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${isLate ? LATE_START_STYLE.bar : getCorrectiveStatusBar(code)}`}
      />

      <div className="space-y-2.5 py-3 pl-[18px] pr-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold leading-[1.4] tracking-[0.4px] text-slate-600">
            {data.number ?? "Correctivo"}
          </p>
          <span className={`shrink-0 leading-[1.4] ${getCorrectiveStatusPill(code)} !px-2.5`}>
            <span className="sr-only">Estado: </span>
            {getCorrectiveStatusLabel(data.statusCode, data.status)}
          </span>
        </div>

        <h3 className="break-words text-[15px] font-semibold leading-[1.3] text-slate-900">
          {canOpen ? (
            <Link
              to={to!}
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>

        {isLate ? (
          <p
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold leading-[1.4] ${LATE_START_STYLE.badge}`}
          >
            <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
            Atrasado ·{" "}
            {perspective === "operator"
              ? `Llevas ${formatLate(lateMs)} de retraso`
              : `Debió iniciar hace ${formatLate(lateMs)}`}
          </p>
        ) : null}

        <dl className="space-y-[7px] rounded-lg bg-slate-50 px-3 py-2.5">
          {fieldsFor(data, perspective).map(({ icon: Icon, label, value, dateTime }) => (
            <div key={label} className="flex items-start gap-2">
              <Icon aria-hidden className="mt-[3px] h-3.5 w-3.5 shrink-0 text-slate-500" />
              <dt className="w-24 shrink-0 pt-px text-xs leading-[1.4] text-slate-600">
                {label}
              </dt>
              <dd className="min-w-0 flex-1 break-words text-sm font-medium leading-[1.4] text-slate-900">
                {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center justify-between gap-2">
          {priority ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-[3px] pl-2 pr-[9px] text-xs font-medium leading-[1.4] text-slate-700">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT_CLASSES[priority]}`}
              />
              {PRIORITY_PHRASES[priority]}
            </span>
          ) : (
            <span />
          )}

          {canOpen ? (
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-0.5 text-xs font-semibold leading-[1.4] text-blue-600"
            >
              {actionLabel}
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : disabledReason ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-[3px] pl-2 pr-[9px] text-xs font-medium leading-[1.4] text-slate-600">
              <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" />
              {disabledReason}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};
