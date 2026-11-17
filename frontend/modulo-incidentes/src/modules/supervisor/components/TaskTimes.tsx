import { AlertTriangle } from "lucide-react";
import {
  taskTimes,
  type TaskTimesInput,
} from "@/modules/supervisor/utils/taskTimes";
import { formatDayMonthTime } from "@/shared/utils/dateUtils";

type Props = TaskTimesInput & { checkoutDate?: string | null };

/**
 * Checkout, inicio y fin reales, duración y retraso de una limpieza, con el
 * aviso de fechas inconsistentes. Lo comparten la ficha de AsistenteSL y las
 * pantallas de supervisión.
 */
export const TaskTimes = ({ checkoutDate, ...times }: Props) => {
  const { duration, delay, endsBeforeStart } = taskTimes(times);

  return (
    <>
      <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <div className="flex justify-between">
          <span className="text-slate-400">Checkout</span>
          <span>{checkoutDate ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Inicio real</span>
          <span>{formatDayMonthTime(times.actualStartTime)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Fin real</span>
          <span className={endsBeforeStart ? "font-semibold text-red-600" : undefined}>
            {formatDayMonthTime(times.actualEndTime)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Duración</span>
          <span>{duration}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Retraso</span>
          <span>{delay}</span>
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
    </>
  );
};
