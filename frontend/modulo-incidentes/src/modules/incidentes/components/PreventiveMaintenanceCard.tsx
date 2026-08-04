import { AlertTriangle, CalendarClock, MapPin, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPreventiveStatusLabel,
  PREVENTIVE_STATUS_BADGE_CLASSES,
  PREVENTIVE_STATUS_BORDER_CLASSES,
} from "@/modules/incidentes/constants/preventiveStatus";
import type { PreventiveMaintenance } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = PreventiveMaintenance;

const formatShortDate = (value: string | null) => {
  if (!value) {
    return "Sin fecha";
  }

  return new Date(value).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const PreventiveMaintenanceCard = ({
  id,
  number,
  subject,
  statusCode,
  status,
  isOverdue,
  site,
  equipment,
  dueDate,
}: Props) => {
  const navigate = useNavigate();

  const border = isOverdue
    ? "border-red-500"
    : (PREVENTIVE_STATUS_BORDER_CLASSES[statusCode ?? ""] ??
      "border-slate-300");

  // Reanudar un suspendido se hace en OpenMAINT, no desde la app
  const isSuspended = statusCode === "Suspension";

  return (
    <article className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${border}`}>
      {/* Identidad de la instancia: número + breve descripción */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">
            {number ?? "Preventivo"}
          </p>

          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {subject ?? "Mantenimiento preventivo"}
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
            PREVENTIVE_STATUS_BADGE_CLASSES[statusCode ?? ""] ??
            "bg-slate-100 text-slate-700"
          }`}
        >
          {getPreventiveStatusLabel(statusCode, status)}
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
          <Wrench className="h-4 w-4 shrink-0" />
          <span>{equipment ?? "Equipo sin especificar"}</span>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span>{site ?? "Sin sitio"}</span>
        </div>

        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>Fecha final de ejecución: {formatShortDate(dueDate)}</span>
        </div>
      </div>

      {/* Footer. Abrir arranca la ejecución si el mantenimiento está asignado */}
      <div className="mt-4 flex items-center justify-end gap-3">
        {isSuspended ? (
          <p className="text-xs text-slate-500">
            Reanúdalo en OpenMAINT para continuar
          </p>
        ) : null}

        <button
          type="button"
          disabled={isSuspended}
          onClick={() => navigate(`/preventive-maintenance/${id}`)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
            isSuspended
              ? "cursor-not-allowed bg-slate-300"
              : "bg-brand hover:bg-brand-hover"
          }`}
        >
          Abrir
        </button>
      </div>
    </article>
  );
};
