import { ClipboardList } from "lucide-react";
import { formatMediumDateTime } from "@/shared/utils/dateUtils";

/** Nota de la bitácora del proceso posterior a la apertura. */
export type LogEntry = {
  /** Fecha y hora local sin zona; `null` si no se pudo leer. */
  at: string | null;
  stepCode: string | null;
  step: string | null;
  author: string | null;
  role: string | null;
  note: string;
  /** El supervisor devolvió el trabajo a asignación con esta nota. */
  isRejection: boolean;
};

type Props = {
  entries: LogEntry[] | null | undefined;
  /** El detalle del supervisor usa títulos más pequeños. */
  variant?: "operator" | "supervisor";
  /** Si se indica, sin notas se muestra la tarjeta con este texto */
  emptyMessage?: string;
};

const STEP_LABELS: Record<string, string> = {
  CM02: "Asignación",
  CM03: "Ejecución",
  CM05: "Revisión de mantenimiento",
  CM07: "Gestión",
};

const ROLE_LABELS: Record<string, string> = {
  SupervisorMantenimiento: "Supervisor de mantenimiento",
};

const stepLabel = (entry: LogEntry) => {
  const label =
    (entry.stepCode && STEP_LABELS[entry.stepCode]) || entry.step || "Nota";

  return entry.isRejection ? "Reapertura de mantenimiento" : label;
};

/** Notas del proceso en orden cronológico. Sin notas no se pinta nada. */
export const NotesLogCard = ({
  entries,
  variant = "operator",
  emptyMessage,
}: Props) => {
  if (!entries || entries.length === 0) {
    return emptyMessage ? (
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-slate-500" aria-hidden />
          <h2 className="text-base font-semibold text-slate-900">Notas</h2>
        </div>
        <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {emptyMessage}
        </p>
      </section>
    ) : null;
  }

  const isOperator = variant === "operator";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList
            className={`text-slate-500 ${isOperator ? "h-5 w-5" : "h-4 w-4"}`}
          />
          <h2
            className={
              isOperator
                ? "text-base font-semibold text-slate-900"
                : "text-sm font-bold text-slate-900"
            }
          >
            Notas
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {entries.length === 1 ? "1 nota" : `${entries.length} notas`}
        </span>
      </div>

      <ol className="mt-4">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          const who = [
            entry.author,
            entry.role ? (ROLE_LABELS[entry.role] ?? entry.role) : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <li
              key={`${entry.at}-${index}`}
              className={`relative flex gap-2.5 ${isLast ? "" : "pb-4"}`}
            >
              {isLast ? null : (
                <span className="absolute bottom-0 left-1 top-[19px] w-0.5 rounded bg-slate-200" />
              )}
              <span
                className={`mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${
                  entry.isRejection ? "bg-amber-600" : "bg-brand"
                }`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {stepLabel(entry)}
                  </p>
                  <span className="shrink-0 pt-0.5 text-xs text-slate-400">
                    {formatMediumDateTime(entry.at, "")}
                  </span>
                </div>

                {who ? (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">
                    {who}
                  </p>
                ) : null}

                <p
                  className={`mt-2 whitespace-pre-line rounded-xl p-3 text-sm leading-6 ${
                    entry.isRejection
                      ? "border border-amber-200 bg-amber-50 text-amber-800"
                      : "bg-slate-50 text-slate-600"
                  }`}
                >
                  {entry.note}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
