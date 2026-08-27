import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Layers,
  MapPin,
  UserRound,
  UserRoundX,
  Wrench,
} from "lucide-react";
import {
  CORRECTIVE_PENDING_REVIEW_STATUS,
  getCorrectiveStatusBadge,
  getCorrectiveStatusBorder,
  getCorrectiveStatusLabel,
} from "@/modules/incidentes/constants/correctiveStatus";
import {
  getPreventiveStatusBadge,
  getPreventiveStatusBorder,
  getPreventiveStatusLabel,
} from "@/modules/incidentes/constants/preventiveStatus";
import {
  getPriorityLabel,
  PRIORITY_BADGE_CLASSES,
  toPriorityCode,
} from "@/shared/constants/priority";
import {
  BADGE_SHAPE,
  OVERDUE_STYLE,
} from "@/shared/constants/statusPalette";

export type MaintenanceCardKind = "corrective" | "preventive";

/**
 * Vista mínima que necesita la tarjeta. Es deliberadamente más pequeña que los
 * tipos de cada módulo para que sirva a los tres orígenes: el listado del
 * supervisor, los correctivos del técnico y sus preventivos.
 */
export type MaintenanceCardData = {
  id: number;
  kind: MaintenanceCardKind;
  number: string | null;
  /** Qué hay que hacer: descripción del correctivo o asunto del preventivo */
  subject: string | null;
  /** Código estable; nunca la etiqueta traducida */
  statusCode: string | null;
  /** Etiqueta de OpenMAINT, como respaldo si el código no está mapeado */
  status: string | null;
  site: string | null;
  /** Ubicación (correctivo) o equipo/activo intervenido (preventivo) */
  target: string | null;
  assignee: string | null;
  /** Código estable de prioridad; los preventivos no la traen */
  priorityCode: string | null;
  openingDate: string | null;
  plannedStart: string | null;
  dueDate: string | null;
  isOverdue: boolean;
};

type Props = {
  maintenance: MaintenanceCardData;
  /** El equipo ve sus propias tareas: mostrar el cesionario sobra */
  showAssignee?: boolean;
  onOpen: (maintenance: MaintenanceCardData) => void;
  /** Motivo por el que no se puede abrir; también deshabilita el botón */
  disabledReason?: string | null;
  openLabel?: string;
};

import { formatShortDate as formatShortDateUtil, formatMediumDateTime as formatDateTime } from "@/shared/utils/dateUtils";

const formatShortDate = (value: string | null) =>
  formatShortDateUtil(value, "Sin fecha");


/**
 * Tarjeta única de mantenimiento, para correctivo y preventivo y para las dos
 * vistas (equipo y supervisor).
 *
 * Sustituye a tres componentes que mostraban lo mismo de formas distintas:
 * `TaskCard` (que además nunca llegó a pintar el número de incidente y coloreaba
 * el borde por prioridad en vez de por estado), `PreventiveMaintenanceCard` y
 * `SupervisedMaintenanceCard`.
 *
 * Las fechas se muestran **solo si tienen dato**: los correctivos no tienen
 * fecha límite en OpenMAINT, así que pintar la fila siempre dejaría un hueco.
 */
export const MaintenanceCard = ({
  maintenance,
  showAssignee = false,
  onOpen,
  disabledReason = null,
  openLabel = "Abrir",
}: Props) => {
  const isCorrective = maintenance.kind === "corrective";

  const border = maintenance.isOverdue
    ? OVERDUE_STYLE.border
    : isCorrective
      ? getCorrectiveStatusBorder(maintenance.statusCode)
      : getPreventiveStatusBorder(maintenance.statusCode);

  const statusBadge = isCorrective
    ? getCorrectiveStatusBadge(maintenance.statusCode)
    : getPreventiveStatusBadge(maintenance.statusCode);

  const statusLabel = isCorrective
    ? getCorrectiveStatusLabel(maintenance.statusCode, maintenance.status)
    : getPreventiveStatusLabel(maintenance.statusCode, maintenance.status);

  const priority = toPriorityCode(maintenance.priorityCode);

  const pendingReview =
    isCorrective && maintenance.statusCode === CORRECTIVE_PENDING_REVIEW_STATUS;

  const plannedStart = formatDateTime(maintenance.plannedStart);
  const dueDate = formatDateTime(maintenance.dueDate);
  const isDisabled = Boolean(disabledReason);

  return (
    <article className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${border}`}>
      {/* Identidad: número + qué hay que hacer */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-brand">
            {maintenance.number ?? (isCorrective ? "Correctivo" : "Preventivo")}
          </p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {maintenance.subject ?? "Sin descripción"}
          </h3>
        </div>

        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {formatShortDate(maintenance.openingDate ?? maintenance.dueDate)}
        </span>
      </div>

      {/* Distintivos: estado, prioridad, y avisos */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`inline-block ${statusBadge}`}>{statusLabel}</span>

        {priority ? (
          <span
            className={`inline-block ${BADGE_SHAPE} ${PRIORITY_BADGE_CLASSES[priority]}`}
          >
            {getPriorityLabel(priority)}
          </span>
        ) : null}

        {pendingReview ? (
          <span
            className={`inline-flex items-center gap-1 ${BADGE_SHAPE} bg-indigo-100 text-indigo-700`}
          >
            <ClipboardCheck className="h-3 w-3" />
            Por revisar
          </span>
        ) : null}

        {maintenance.isOverdue ? (
          <span
            className={`inline-flex items-center gap-1 ${BADGE_SHAPE} ${OVERDUE_STYLE.badge}`}
          >
            <AlertTriangle className="h-3 w-3" />
            Vencido
          </span>
        ) : null}
      </div>

      {/* Cuerpo */}
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        {maintenance.target ? (
          <div className="flex items-center gap-2">
            {isCorrective ? (
              <Layers className="h-4 w-4 shrink-0" />
            ) : (
              <Wrench className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">{maintenance.target}</span>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">
            {maintenance.site ?? "Sin sitio"}
          </span>
        </div>

        {showAssignee ? (
          maintenance.assignee ? (
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{maintenance.assignee}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-medium text-amber-700">
              <UserRoundX className="h-4 w-4 shrink-0" />
              <span>Sin cesionario</span>
            </div>
          )
        ) : null}

        {plannedStart ? (
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>Inicio previsto: {plannedStart}</span>
          </div>
        ) : null}

        {dueDate ? (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 shrink-0" />
            <span>Fecha límite: {dueDate}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {disabledReason ? (
          <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
            {disabledReason}
          </span>
        ) : null}

        <button
          type="button"
          disabled={isDisabled}
          onClick={() => onOpen(maintenance)}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isDisabled
              ? "cursor-not-allowed bg-slate-200 text-slate-400"
              : "bg-brand text-white hover:bg-brand-hover"
          }`}
        >
          {openLabel}
        </button>
      </div>
    </article>
  );
};
