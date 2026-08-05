import { ChevronRight, History } from "lucide-react";
import type { PreventiveMaintenanceHistoryEntry } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = {
  entries: PreventiveMaintenanceHistoryEntry[];
  loading: boolean;
  error: string | null;
  onOpen: (id: number) => void;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Sin fecha de cierre";
  }

  return new Date(value).toLocaleDateString("es-EC", { dateStyle: "medium" });
};

const StateMessage = ({ children }: { children: string }) => (
  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
    <p className="text-sm text-slate-500">{children}</p>
  </div>
);

export const PreventiveHistorySection = ({
  entries,
  loading,
  error,
  onOpen,
}: Props) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2">
      <History className="h-5 w-5 text-slate-500" />
      <h2 className="text-base font-semibold text-slate-900">
        Historial del equipo
      </h2>
    </div>

    <p className="mt-1 text-sm text-slate-500">
      Últimos mantenimientos realizados sobre este mismo equipo.
    </p>

    {loading ? <StateMessage>Cargando historial...</StateMessage> : null}

    {!loading && error ? (
      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    ) : null}

    {!loading && !error && entries.length === 0 ? (
      <StateMessage>
        Este equipo todavía no tiene mantenimientos completados.
      </StateMessage>
    ) : null}

    {!loading && !error && entries.length > 0 ? (
      <div className="mt-4 space-y-2">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100"
          >
            <span className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {entry.number ?? `Mantenimiento ${entry.id}`}
                </span>
                <span className="block text-xs text-slate-500">
                  {formatDate(entry.execEndDate)} · Completado
                </span>
                {entry.attachmentCount > 0 ? (
                  <span className="mt-1.5 inline-flex rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    PDF · Informe generado
                  </span>
                ) : null}
              </span>
            </span>

            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        ))}
      </div>
    ) : null}
  </section>
);
