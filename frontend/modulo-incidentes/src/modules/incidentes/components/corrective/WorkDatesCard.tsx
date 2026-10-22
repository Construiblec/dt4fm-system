import { CalendarClock } from "lucide-react";
import {
  buildWorkDateRows,
  type WorkDates,
} from "@/modules/incidentes/utils/workDates";

/** «Fechas del trabajo»; si ninguna fecha tiene valor, no se pinta. */
export const WorkDatesCard = (dates: WorkDates) => {
  const rows = buildWorkDateRows(dates);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-slate-500" aria-hidden />
        <h2 className="text-base font-semibold text-slate-900">
          Fechas del trabajo
        </h2>
      </div>

      <dl className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3"
          >
            <dt className="text-sm text-slate-600">{row.label}</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
