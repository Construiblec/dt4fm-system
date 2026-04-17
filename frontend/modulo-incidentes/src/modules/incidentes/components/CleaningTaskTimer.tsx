import { AlertTriangle, Clock3, TimerReset } from "lucide-react";
import { useActiveTaskTimer } from "@/modules/incidentes/hooks/useActiveTaskTimer";

export const CleaningTaskTimer = () => {
  const {
    elapsedFormatted,
    isOvertime,
    overtimeFormatted,
    plannedDurationFormatted,
    remainingFormatted,
  } = useActiveTaskTimer();

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-cyan-600" />
        <h2 className="text-base font-semibold text-slate-900">Tiempo de ejecucion</h2>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Tiempo transcurrido
        </p>
        <p className="mt-2 text-3xl font-bold text-slate-900">{elapsedFormatted}</p>
      </div>

      {isOvertime ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Tiempo excedido</p>
            <p>
              Planeado: {plannedDurationFormatted ?? "Sin referencia"}.
              {overtimeFormatted ? ` Excedido en ${overtimeFormatted}.` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-emerald-800">
          <TimerReset className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Dentro del tiempo planeado</p>
            <p>
              Tiempo planeado: {plannedDurationFormatted ?? "Sin referencia"}.
              {remainingFormatted ? ` Restante: ${remainingFormatted}.` : ""}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
