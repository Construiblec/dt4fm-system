import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { AppHeader } from "@/shared/components/AppHeader";
import { usePendingTasks } from "@/modules/coordinador/hooks/usePendingTasks";
import { PendingTaskCard } from "@/modules/coordinador/components/PendingTaskCard";
import { SyncPanel } from "@/modules/coordinador/components/SyncPanel";
import { FloatingNewTaskButton } from "@/modules/coordinador/components/FloatingNewTaskButton";

type Tab = "pending" | "sync";

export const CoordinadorHomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "sync" ? "sync" : "pending";

  const { tasks, loading, error, load } = usePendingTasks();

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (next: Tab) => {
    setSearchParams(next === "pending" ? {} : { tab: next });
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        <AppHeader />

        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <h1 className="text-center text-2xl font-bold text-slate-900">
              Coordinación de Limpiezas
            </h1>

            <div className="flex gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => setTab("pending")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  tab === "pending"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-500"
                }`}
              >
                Pendientes {tasks.length > 0 ? `(${tasks.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("sync")}
                className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${
                  tab === "sync" ? "bg-indigo-600 text-white" : "text-slate-500"
                }`}
              >
                Sincronización
              </button>
            </div>

            {tab === "pending" ? (
              <div className="space-y-4">
                {loading ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                    Cargando tareas pendientes...
                  </div>
                ) : null}

                {!loading && error ? (
                  <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
                    {error}
                  </div>
                ) : null}

                {!loading && !error && tasks.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 text-center shadow-sm">
                    <ClipboardCheck className="h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-400">
                      No hay tareas pendientes por asignar
                    </p>
                  </div>
                ) : null}

                {!loading && !error && tasks.length > 0
                  ? tasks.map((task) => <PendingTaskCard key={task.id} task={task} />)
                  : null}
              </div>
            ) : (
              <SyncPanel />
            )}
          </div>
        </section>

        {tab === "pending" ? <FloatingNewTaskButton /> : null}
      </main>
    </AppLayout>
  );
};
