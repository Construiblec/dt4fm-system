import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Siren } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { ReportCard } from "@/modules/incidentes/components/ReportRow";
import { isOpenReport } from "@/modules/incidentes/constants/reporterStatus";
import { useReportedIncidents } from "@/modules/incidentes/hooks/useReportedIncidents";
import { getHomeRoute } from "@/shared/auth/session";

type Tab = "open" | "closed";

export const MyReportsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("open");
  const { data, isPending, isError, refetch } = useReportedIncidents();

  const reports = data ?? [];
  const open = reports.filter((report) => isOpenReport(report.statusCode));
  const closed = reports.filter((report) => !isOpenReport(report.statusCode));
  const shown = tab === "open" ? open : closed;

  const tabs: [Tab, string, number][] = [
    ["open", "En curso", open.length],
    ["closed", "Cerrados", closed.length],
  ];

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-28">
        <header className="flex items-center gap-3 px-4 pb-1 pt-4">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1
                ? navigate(-1)
                : navigate(getHomeRoute())
            }
            aria-label="Volver"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">Mis reportes</h1>
        </header>

        <section className="space-y-3 px-4 pt-3">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {tabs.map(([key, label, count]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                    active ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 text-xs font-bold ${
                      active
                        ? "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {isPending ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">
              Cargando tus reportes…
            </p>
          ) : isError ? (
            <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
              No se pudieron cargar tus reportes.{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline"
              >
                Reintentar
              </button>
            </div>
          ) : shown.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">
              {tab === "open"
                ? "No tienes reportes en curso."
                : "Aún no tienes reportes cerrados."}
            </p>
          ) : (
            shown.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))
          )}
        </section>

        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center">
          <div className="w-full max-w-md border-t border-slate-200 bg-white px-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3.5">
            <button
              type="button"
              onClick={() => navigate("/reportar-incidente")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e5372b] py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99]"
            >
              <Siren className="h-5 w-5" />
              Reportar novedad
            </button>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};
