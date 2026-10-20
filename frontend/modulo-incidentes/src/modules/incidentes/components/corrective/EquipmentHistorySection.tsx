import {
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  History,
  Info,
  Wrench,
} from "lucide-react";
import type { EquipmentHistoryEntry } from "@/modules/incidentes/types/CorrectiveDocumentation";
import { formatMediumDate } from "@/shared/utils/dateUtils";

type Props = {
  entries: EquipmentHistoryEntry[];
  loading: boolean;
  error: string | null;
  /** `false` cuando el correctivo no tiene equipo asociado */
  hasEquipment: boolean;
  onOpen: (entry: EquipmentHistoryEntry) => void;
};

const KIND = {
  corrective: {
    label: "Correctivo",
    icon: Wrench,
    className: "bg-orange-50 text-orange-700",
  },
  preventive: {
    label: "Preventivo",
    icon: CalendarDays,
    className: "bg-emerald-50 text-emerald-700",
  },
} as const;

export const EquipmentHistorySection = ({
  entries,
  loading,
  error,
  hasEquipment,
  onOpen,
}: Props) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2">
      <History className="h-5 w-5 text-slate-500" aria-hidden />
      <h2 className="text-base font-semibold text-slate-900">
        Historial del equipo
      </h2>
    </div>

    {hasEquipment ? (
      <p className="mt-1 text-sm text-slate-600">
        Últimos correctivos y preventivos de este equipo. Toca uno para ver su
        detalle.
      </p>
    ) : null}

    {loading ? (
      <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        Cargando historial...
      </p>
    ) : null}

    {!loading && error ? (
      <p className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-5 text-center text-sm text-red-700">
        {error}
      </p>
    ) : null}

    {!loading && !error && entries.length === 0 ? (
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden />
        <div>
          <p className="text-sm font-bold text-slate-900">Sin historial</p>
          <p className="text-sm text-slate-600">
            {hasEquipment
              ? "Este equipo todavía no tiene mantenimientos cerrados."
              : "No hay un equipo asociado del que mostrar mantenimientos anteriores."}
          </p>
        </div>
      </div>
    ) : null}

    {!loading && !error && entries.length > 0 ? (
      <ul className="mt-4 space-y-2">
        {entries.map((entry) => {
          const kind = KIND[entry.kind];
          const KindIcon = kind.icon;

          return (
            <li key={`${entry.kind}-${entry.id}`}>
              <button
                type="button"
                onClick={() => onOpen(entry)}
                aria-label={`Ver detalle de ${entry.number ?? "mantenimiento"}`}
                className="flex w-full items-center gap-3 rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900">
                      {entry.number ?? `Mantenimiento ${entry.id}`}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${kind.className}`}
                    >
                      <KindIcon className="h-3 w-3" aria-hidden />
                      {kind.label}
                    </span>
                  </span>
                  {entry.subject ? (
                    <span className="block text-sm text-slate-700">
                      {entry.subject}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <Check
                      className="h-3.5 w-3.5 text-emerald-700"
                      aria-hidden
                    />
                    {formatMediumDate(entry.closedAt, "Sin fecha de cierre")} ·
                    Completado
                  </span>
                  {entry.attachmentCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      <FileText className="h-3 w-3" aria-hidden />
                      {entry.attachmentCount === 1
                        ? "1 archivo"
                        : `${entry.attachmentCount} archivos`}
                    </span>
                  ) : null}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-slate-500"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    ) : null}
  </section>
);
