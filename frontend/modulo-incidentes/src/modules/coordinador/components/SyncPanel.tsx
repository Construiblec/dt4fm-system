import { useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useSync } from "@/modules/coordinador/hooks/useSync";
import { UpcomingCleaningsTable } from "@/modules/coordinador/components/UpcomingCleaningsTable";

const today = () => new Date().toISOString().split("T")[0];
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
};

export const SyncPanel = () => {
  const {
    syncing,
    syncError,
    lastResult,
    runSyncToday,
    upcoming,
    loadingUpcoming,
    upcomingError,
    loadUpcoming,
  } = useSync();

  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(inDays(7));

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            Sincronizar checkouts de hoy
          </p>
          {lastResult ? (
            <p className="mt-0.5 text-xs text-slate-400">
              {lastResult.created} creadas, {lastResult.skipped} duplicadas
              {lastResult.failed > 0 ? `, ${lastResult.failed} con error` : ""}
            </p>
          ) : null}
          {syncError ? (
            <p className="mt-0.5 text-xs font-medium text-red-500">{syncError}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void runSyncToday()}
          disabled={syncing}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar ahora"}
        </button>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-slate-700">Ver próximas limpiezas</p>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label htmlFor="dateFrom" className="text-xs font-medium text-slate-500">
              Inicio
            </label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label htmlFor="dateTo" className="text-xs font-medium text-slate-500">
              Fin
            </label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadUpcoming(dateFrom, dateTo)}
            aria-label="Buscar"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {upcomingError ? (
          <p className="text-xs font-medium text-red-500">{upcomingError}</p>
        ) : null}

        <UpcomingCleaningsTable checkouts={upcoming} loading={loadingUpcoming} />
      </section>
    </div>
  );
};
