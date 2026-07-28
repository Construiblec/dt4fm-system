import { AlertTriangle, CalendarClock, ClipboardList, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PreventiveMaintenance } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = PreventiveMaintenance;

/** Color del borde izquierdo según el estado del mantenimiento. */
const borderByStatus: Record<string, string> = {
  Planning: "border-slate-400",
  Acceptance: "border-amber-500",
  Execution: "border-blue-500",
  Suspension: "border-violet-500",
  Completed: "border-emerald-500",
  Canceled: "border-slate-300",
};

const badgeByStatus: Record<string, string> = {
  Planning: "bg-slate-100 text-slate-700",
  Acceptance: "bg-amber-100 text-amber-700",
  Execution: "bg-blue-100 text-blue-700",
  Suspension: "bg-violet-100 text-violet-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Canceled: "bg-red-100 text-red-700",
};

const formatShortDate = (value: string | null) => {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
  });
};

export const PreventiveMaintenanceCard = ({
  id,
  number,
  statusCode,
  status,
  isOverdue,
  site,
  equipment,
  plan,
  dueDate,
}: Props) => {
  const navigate = useNavigate();

  const border = isOverdue
    ? "border-red-500"
    : (borderByStatus[statusCode ?? ""] ?? "border-slate-300");

  return (
    <article className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {number ?? "Preventivo"}
          </p>

          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {equipment ?? "Equipo sin especificar"}
          </h3>
        </div>

        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {formatShortDate(dueDate)}
        </span>
      </div>

      {/* Estado */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${
            badgeByStatus[statusCode ?? ""] ?? "bg-slate-100 text-slate-700"
          }`}
        >
          {status ?? "Sin estado"}
        </span>

        {isOverdue ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3 w-3" />
            Vencido
          </span>
        ) : null}
      </div>

      {/* Cuerpo */}
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0" />
          <span>{plan ?? "Sin plan asociado"}</span>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>{site ?? "Sin sitio"}</span>
        </div>

        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>Vence: {formatShortDate(dueDate)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => navigate(`/preventive-maintenance/${id}`)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Abrir
        </button>
      </div>
    </article>
  );
};
