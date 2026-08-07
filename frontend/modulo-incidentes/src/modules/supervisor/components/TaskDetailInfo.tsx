import { User, MapPin, Hash } from "lucide-react";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { cleanObservationText } from "@/shared/utils/textUtils";

const phaseStyles: Record<string, string> = {
  Assigned: "bg-blue-100 text-blue-700",
  InExecution: "bg-amber-100 text-amber-700",
  Completed: "bg-violet-100 text-violet-700",
  Reviewed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-red-100 text-red-700",
};

const phaseLabels: Record<string, string> = {
  Assigned: "Asignada",
  InExecution: "En ejecución",
  Completed: "Completada",
  Reviewed: "Revisada",
  Cancelled: "Cancelada",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const phaseStyle = phaseStyles[detail.phase] ?? "bg-slate-100 text-slate-700";
  // ExecutionTime es el tiempo realmente trabajado, sumando todas las ejecuciones.
  // El respaldo por resta solo aplica a tareas antiguas que nunca lo registraron.
  const duration =
    formatExecutionTime(detail.executionTime) ??
    calcDuration(detail.actualStartTime, detail.actualEndTime);

  // El retraso se calcula de las fechas, igual que en la tarjeta del equipo, para que
  // ambas vistas coincidan. PlannedStartTime y ActualStartTime se conservan intactos al
  // reabrir, así que el valor es correcto sin depender del DelayTime guardado.
  const delayLabel = calcDuration(detail.plannedStartTime, detail.actualStartTime);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
      {/* Phase + taskNumber */}
      <div className="flex items-center justify-between">
        <span className={`rounded-lg px-3 py-1 text-xs font-bold ${phaseStyle}`}>
          {phaseLabels[detail.phase] ?? detail.phase}
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
          <span>{formatDateTime(detail.actualEndTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Duración</span>
          <span>{duration}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Retraso</span>
          <span>{delayLabel === "—" ? "Sin retraso" : delayLabel}</span>
        </div>
      </div>

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
