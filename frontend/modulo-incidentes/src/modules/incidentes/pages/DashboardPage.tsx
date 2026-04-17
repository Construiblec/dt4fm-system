import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useState } from "react";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { TaskCard } from "@/modules/incidentes/components/TaskCard";
import { CleaningTaskCard } from "@/modules/incidentes/components/CleaningTaskCard";
import { getMyIncidents } from "@/modules/incidentes/services/incidentsService";
import { fetchMyCleaningTasks } from "@/modules/incidentes/services/cleaningTasksService";
import type { Incident } from "@/modules/incidentes/types/Incident";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { isActiveCleaningTaskPhase, useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { Filter, Eraser } from "lucide-react";

export const DashboardPage = () => {
  const logout = useLogout();
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const syncActiveTask = useCleaningTaskExecutionStore((state) => state.syncActiveTask);
  const clearActiveTask = useCleaningTaskExecutionStore((state) => state.clearActiveTask);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "Ejecución" | "Otros"
  >("ALL");

  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [cleaningLoading, setCleaningLoading] = useState(true);
  const [cleaningError, setCleaningError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getMyIncidents();
        setIncidents(data);
      } catch {
        setError("No se pudieron cargar los incidentes");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setCleaningLoading(true);
        setCleaningError(null);
        const data = await fetchMyCleaningTasks();
        setCleaningTasks(data);
      } catch {
        setCleaningError("No se pudieron cargar las tareas de limpieza");
      } finally {
        setCleaningLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (cleaningLoading) {
      return;
    }

    if (cleaningError) {
      clearActiveTask();
      return;
    }

    const backendActiveTask = cleaningTasks.find((task) =>
      isActiveCleaningTaskPhase(task.phase),
    );

    if (!backendActiveTask) {
      clearActiveTask();
      return;
    }

    syncActiveTask({
      id: backendActiveTask.id,
      taskNumber: backendActiveTask.taskNumber,
      description: backendActiveTask.description,
      phase: backendActiveTask.phase,
      actualStartTime: backendActiveTask.actualStartTime ?? new Date().toISOString(),
      plannedEndTime: backendActiveTask.plannedEndTime,
      unitDescription: backendActiveTask.unit?.description ?? backendActiveTask.description,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleaningLoading, cleaningError, cleaningTasks, clearActiveTask, syncActiveTask]);

  const filteredIncidents = incidents.filter((incident) => {
    const matchPriority =
      priorityFilter === "ALL" || incident.priority === priorityFilter;

    const matchStatus =
      statusFilter === "ALL" ||
      (statusFilter === "Ejecución" && incident.status === "Ejecución") ||
      (statusFilter === "Otros" && incident.status !== "Ejecución");

    return matchPriority && matchStatus;
  });

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        <header className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Construiblec"
              className="h-12 w-12 rounded-xl bg-white p-1 shadow-sm"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
                Construiblec
              </p>
              <h1 className="text-lg font-bold text-slate-900">
                Mantenimiento y Limpieza
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Salir
          </button>
        </header>

        <section className="flex-1 px-4 pb-32">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">Mis tareas</h2>
            </div>

            {!loading && !error && incidents.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white px-3 py-2 shadow-sm">
                {/* ICONO */}
                <div className="flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-100 p-2">
                  <Filter className="h-4 w-4 text-slate-600" />
                </div>

                {/* ESTADO */}
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value as "ALL" | "Ejecución" | "Otros",
                    )
                  }
                  className="flex-shrink-0 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                >
                  <option value="ALL">Estado</option>
                  <option value="Ejecución">En ejecución</option>
                  <option value="Otros">Otros</option>
                </select>

                {/* PRIORIDAD */}
                <select
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as string | "ALL")
                  }
                  className="flex-shrink-0 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                >
                  <option value="ALL">Prioridad</option>
                  <option value="Alto">Alto</option>
                  <option value="Medio">Medio</option>
                  <option value="Bajo">Bajo</option>
                </select>

                {/* LIMPIAR */}
                <button
                  type="button"
                  onClick={() => {
                    setPriorityFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
                >
                  <Eraser className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                Cargando incidentes...
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rounded-xl bg-white p-4 text-sm text-red-600 shadow-sm">
                No tienes incidentes asignados
              </div>
            ) : null}

            {!loading && !error && incidents.length === 0 ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                No tienes incidentes asignados
              </div>
            ) : null}

            {!loading &&
            !error &&
            incidents.length > 0 &&
            filteredIncidents.length === 0 ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                No hay incidentes que coincidan con los filtros
              </div>
            ) : null}

            {!loading && !error && filteredIncidents.length > 0 ? (
              <div className="space-y-4">
                {filteredIncidents.map((incident) => (
                  <TaskCard key={incident.id} {...incident} />
                ))}
              </div>
            ) : null}

            {/* Cleaning tasks section */}
            {cleaningLoading ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                Cargando tareas de limpieza...
              </div>
            ) : null}

            {!cleaningLoading && cleaningError ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                No tienes tareas de limpieza asignadas
              </div>
            ) : null}

            {!cleaningLoading && !cleaningError && cleaningTasks.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Limpieza
                </p>
                {cleaningTasks.map((task) => (
                  <CleaningTaskCard key={task.id} {...task} />
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <FloatingReportButton />
      </main>
    </AppLayout>
  );
};
