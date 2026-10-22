import { ChevronRight, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import {
  REPORTER_TONES,
  toReporterStep,
} from "@/modules/incidentes/constants/reporterStatus";
import type { ReportedIncident } from "@/modules/incidentes/services/incidentsService";
import {
  formatDayMonthTime,
  formatRelativeTime,
} from "@/shared/utils/dateUtils";
import { formatPlace } from "@/shared/utils/locationLabel";
import { ProgressRing, ReporterChip } from "./ProgressRing";

const titleOf = (report: ReportedIncident) =>
  report.subject || report.location || report.number;

const lastChange = (report: ReportedIncident) =>
  formatRelativeTime(report.updatedAt ?? report.createdAt);

/** Fila compacta de la hoja «Novedades». */
export const ReportRow = ({
  report,
  onOpen,
}: {
  report: ReportedIncident;
  onOpen?: () => void;
}) => {
  const status = toReporterStep(report.statusCode);

  return (
    <Link
      to={`/mis-reportes/${report.id}`}
      onClick={onOpen}
      className="flex items-center gap-3 py-3"
    >
      <ProgressRing status={status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">
          {titleOf(report)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <ReporterChip status={status} />
          <span className="text-xs text-slate-400">{lastChange(report)}</span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
    </Link>
  );
};

/** Tarjeta de la lista «Mis reportes». */
export const ReportCard = ({ report }: { report: ReportedIncident }) => {
  const status = toReporterStep(report.statusCode);
  const place = formatPlace(report.building, report.area, report.floor);
  const phrase =
    status.tone === "assigned" && report.plannedStart
      ? `Previsto ${formatDayMonthTime(report.plannedStart)}`
      : status.tone === "inProgress" || status.tone === "assigned"
        ? status.phrase
        : null;

  return (
    <Link
      to={`/mis-reportes/${report.id}`}
      className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ProgressRing status={status} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-600">
            {report.number}
          </span>
          <span className="text-xs text-slate-400">{lastChange(report)}</span>
        </div>
        <p className="text-[15px] font-semibold leading-snug text-slate-900">
          {titleOf(report)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ReporterChip status={status} />
          {phrase ? (
            <span className={`text-xs ${REPORTER_TONES[status.tone].text}`}>
              {phrase}
            </span>
          ) : null}
        </div>
        {place ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
      </div>
      <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-slate-300" />
    </Link>
  );
};
