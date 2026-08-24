import { AlertTriangle, User, MapPin, Hash } from "lucide-react";
import {
  getCleaningPhaseLabel,
  getCleaningPhasePill,
} from "@/modules/incidentes/constants/cleaningPhase";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { cleanObservationText } from "@/shared/utils/textUtils";

import { formatDayMonthTime as formatDateTime } from "@/shared/utils/dateUtils";

function calcDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60_000);
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;

  if (d > 0) {
    let res = `${d}d`;
    if (h > 0) res += ` ${h}h`;
    if (m > 0) res += ` ${m}min`;
    return res;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** ExecutionTime y DelayTime llegan de OpenMAINT en minutos (double). */
function formatExecutionTime(minutesFloat?: number | null): string | null {
  if (minutesFloat == null) return null;
  const totalMinutes = Math.round(minutesFloat);
  if (totalMinutes <= 0) return "—";
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;

  if (d > 0) {
    let res = `${d}d`;
    if (h > 0) res += ` ${h}h`;
    if (m > 0) res += ` ${m}min`;
    return res;
  }
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

type Props = {
  detail: CleaningTaskDetail;
};

export const TaskDetailInfo = ({ detail }: Props) => {
  // ExecutionTime es el tiempo realmente trabajado, sumando todas las ejecuciones.
  // El respaldo por resta solo aplica a tareas antiguas que nunca lo registraron.
  const duration =
    formatExecutionTime(detail.executionTime) ??
    calcDuration(detail.actualStartTime, detail.actualEndTime);

  /**
   * El retraso se mide contra `PlannedStartTime`, tal como llega de OpenMAINT.
   * Ambas fechas se conservan intactas al reabrir, así que el cálculo es válido
   * sin depender del DelayTime guardado.
   *
   * Sin horario planificado no se puede afirmar que no hubo retraso, así que se
   * distingue de "Sin retraso": antes ambos casos mostraban lo mismo.
   */
  const delayLabel = (() => {
    if (!detail.plannedStartTime) return "Sin planificar";
    if (!detail.actualStartTime) return "—";

    const delay = calcDuration(detail.plannedStartTime, detail.actualStartTime);
    // calcDuration devuelve "—" cuando la resta no es positiva: inició a tiempo.
    return delay === "—" ? "Sin retraso" : delay;
  })();

  /**
   * OpenMAINT acepta que se corrijan a mano ActualStartTime y ActualEndTime, sin
   * validar el orden, y así han entrado tareas con el fin antes del inicio. La
   * duración no lo delata porque sale de `ExecutionTime`, otra fuente. Se avisa
   * en pantalla en lugar de corregir el dato: la fuente de verdad es OpenMAINT.
   */
  const endsBeforeStart =
    detail.actualStartTime != null &&
    detail.actualEndTime != null &&
    new Date(detail.actualEndTime).getTime() <
      new Date(detail.actualStartTime).getTime();

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
      {/* Phase + taskNumber */}
      <div className="flex items-center justify-between">
        <span className={getCleaningPhasePill(detail.phase)}>
          {getCleaningPhaseLabel(detail.phase)}
        </span>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Hash className="h-3 w-3" />
          {detail.taskNumber}
        </div>
      </div>

      {/* Location */}
      <div className="flex items-start gap-2 text-sm text-slate-700">
        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        <div>
          <p className="font-semibold">{detail.unit?.description ?? detail.description}</p>
          {detail.unit && (
            <p className="text-xs text-slate-400">{detail.description}</p>
          )}
        </div>
      </div>

      {/* Employee */}
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <User className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span>{formatEmployeeName(detail.employee?.name)}</span>
      </div>

      {/* Dates */}
      <div className="rounded-xl bg-slate-50 p-3 space-y-2 text-xs text-slate-600">
        <div className="flex justify-between">
          <span className="text-slate-400">Checkout</span>
          <span>{detail.checkoutDate ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Inicio real</span>
          <span>{formatDateTime(detail.actualStartTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Fin real</span>
          <span className={endsBeforeStart ? "font-semibold text-red-600" : undefined}>
            {formatDateTime(detail.actualEndTime)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Duración</span>
          <span>{duration}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Retraso</span>
          <span>{delayLabel}</span>
        </div>
      </div>

      {endsBeforeStart && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <div>
            <p className="text-xs font-semibold text-red-700">
              Fechas inconsistentes
            </p>
            <p className="mt-1 text-xs leading-5 text-red-900">
              El fin real es anterior al inicio real, así que estas fechas no
              describen bien la ejecución. 
            </p>
          </div>
        </div>
      )}

      {/* Task Observations */}
      {!!detail.taskObservations && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="mb-1 text-xs font-semibold text-blue-700">Observaciones de la tarea</p>
          <p className="whitespace-pre-line text-sm text-blue-900 italic">"{cleanObservationText(detail.taskObservations)}"</p>
        </div>
      )}

      {/* Supervision Observations */}
      {!!detail.supervisionObserv && (
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
          <p className="mb-1 text-xs font-semibold text-violet-700">Observaciones de supervisión</p>
          <p className="whitespace-pre-line text-sm text-violet-900 italic">"{cleanObservationText(detail.supervisionObserv)}"</p>
        </div>
      )}

      {/* Team Observations */}
      {!!detail.teamObservations && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-700">Observaciones del empleado</p>
          <p className="whitespace-pre-line text-sm text-amber-900 italic">"{cleanObservationText(detail.teamObservations)}"</p>
        </div>
      )}
    </section>
  );
};
