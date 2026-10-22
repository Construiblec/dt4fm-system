import { parseIotAlarm } from "@/shared/utils/iotAlarmNote";

type Props = {
  notes: string | null | undefined;
  /** El detalle del supervisor usa títulos más pequeños. */
  variant?: "operator" | "supervisor";
};

/** Lo que escribió quien reportó; una alarma IoT se pinta como ficha. */
export const ReportDetailCard = ({ notes, variant = "operator" }: Props) => {
  if (!notes) return null;

  const alarm = parseIotAlarm(notes);
  const titleClass =
    variant === "operator"
      ? "text-base font-semibold text-slate-900"
      : "text-sm font-bold text-slate-900";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className={titleClass}>Detalle</h2>
        {alarm ? (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            Alarma IoT
          </span>
        ) : null}
      </div>

      {alarm ? (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            {alarm.message}
          </p>

          {alarm.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
            >
              {warning}
            </p>
          ))}

          <div className="mt-3 space-y-2">
            {alarm.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3"
              >
                <span className="text-sm text-slate-500">{row.label}</span>
                <span
                  className={`break-words text-right font-medium text-slate-900 ${
                    row.label === "Evento" ? "font-mono text-xs" : "text-sm"
                  }`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
          {notes}
        </p>
      )}
    </section>
  );
};
