import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useState } from "react";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { TaskCard } from "@/modules/incidentes/components/TaskCard";
import { CleaningTaskCard } from "@/modules/incidentes/components/CleaningTaskCard";
import { MaintenanceFilters } from "@/modules/incidentes/components/MaintenanceFilters";
import { CleaningFilters } from "@/modules/incidentes/components/CleaningFilters";
import { getMyIncidents } from "@/modules/incidentes/services/incidentsService";
import { fetchMyCleaningTasks } from "@/modules/incidentes/services/cleaningTasksService";
import type { Incident } from "@/modules/incidentes/types/Incident";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";
import { Pagination } from "../components/Pagination";

type Tab = "maintenance" | "cleaning";

export const DashboardPage = () => {
  const logout = useLogout();
  const syncActiveTask = useCleaningTaskExecutionStore(
    (state) => state.syncActiveTask,
  );
  const clearActiveTask = useCleaningTaskExecutionStore(
    (state) => state.clearActiveTask,
  );

  const ITEMS_PER_PAGE = 5;

  const [maintenancePage, setMaintenancePage] = useState(1);
  const [cleaningPage, setCleaningPage] = useState(1);

  // ── Tab activo ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("maintenance");

  // ── Estado: incidentes de mantenimiento ────────────────────────────────────
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de mantenimiento
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "Ejecución" | "Otros"
  >("ALL");

  // ── Estado: tareas de limpieza ─────────────────────────────────────────────
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [cleaningLoading, setCleaningLoading] = useState(true);
  const [cleaningError, setCleaningError] = useState<string | null>(null);

  // Filtros de limpieza
  const [phaseFilter, setPhaseFilter] = useState<string>("ALL");

  useEffect(() => {
    setMaintenancePage(1);
  }, [priorityFilter, statusFilter]);

  useEffect(() => {
    setCleaningPage(1);
  }, [phaseFilter]);

  // ── Carga de datos ─────────────────────────────────────────────────────────
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

  // ── Sincronización con el store de tarea activa ────────────────────────────
  useEffect(() => {
    if (cleaningLoading) return;

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
      actualStartTime:
        backendActiveTask.actualStartTime ?? new Date().toISOString(),
      plannedEndTime: backendActiveTask.plannedEndTime,
      unitDescription:
        backendActiveTask.unit?.description ?? backendActiveTask.description,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cleaningLoading,
    cleaningError,
    cleaningTasks,
    clearActiveTask,
    syncActiveTask,
  ]);

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filteredIncidents = incidents.filter((incident) => {
    const matchPriority =
      priorityFilter === "ALL" || incident.priority === priorityFilter;
    const matchStatus =
      statusFilter === "ALL" ||
      (statusFilter === "Ejecución" && incident.status === "Ejecución") ||
      (statusFilter === "Otros" && incident.status !== "Ejecución");
    return matchPriority && matchStatus;
  });

  const filteredCleaningTasks = cleaningTasks.filter((task) => {
    return phaseFilter === "ALL" || task.phase === phaseFilter;
  });

  const maintenanceTotalPages = Math.max(
    1,
    Math.ceil(filteredIncidents.length / ITEMS_PER_PAGE),
  );

  const paginatedIncidents = filteredIncidents.slice(
    (maintenancePage - 1) * ITEMS_PER_PAGE,
    maintenancePage * ITEMS_PER_PAGE,
  );

  const paginatedCleaningTasks = filteredCleaningTasks.slice(
    (cleaningPage - 1) * ITEMS_PER_PAGE,
    cleaningPage * ITEMS_PER_PAGE,
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        {/* Header */}
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
            <h2 className="text-2xl font-bold text-slate-900">Mis tareas</h2>

            {/* Tab switcher */}
            <div className="flex rounded-xl bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("maintenance")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  activeTab === "maintenance"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Mantenimiento
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("cleaning")}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                  activeTab === "cleaning"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Limpieza
              </button>
            </div>

            {/* ── Tab: Mantenimiento ─────────────────────────────────────── */}
            {activeTab === "maintenance" ? (
              <>
                {!loading && !error && incidents.length > 0 ? (
                  <MaintenanceFilters
                    priorityFilter={priorityFilter}
                    statusFilter={statusFilter}
                    onPriorityChange={setPriorityFilter}
                    onStatusChange={setStatusFilter}
                    onClear={() => {
                      setPriorityFilter("ALL");
                      setStatusFilter("ALL");
                    }}
                  />
                ) : null}

                {loading ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                    Cargando incidentes...
                  </div>
                ) : null}

                {!loading && error ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
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
                  <>
                    <div className="space-y-4">
                      {paginatedIncidents.map((incident) => (
                        <TaskCard key={incident.id} {...incident} />
                      ))}
                    </div>
                    <Pagination
                      currentPage={maintenancePage}
                      totalPages={maintenanceTotalPages}
                      onChange={setMaintenancePage}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {/* ── Tab: Limpieza ──────────────────────────────────────────── */}
            {activeTab === "cleaning" ? (
              <>
                {!cleaningLoading &&
                !cleaningError &&
                cleaningTasks.length > 0 ? (
                  <CleaningFilters
                    phaseFilter={phaseFilter}
                    onPhaseChange={setPhaseFilter}
                    onClear={() => setPhaseFilter("ALL")}
                  />
                ) : null}

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

                {!cleaningLoading &&
                !cleaningError &&
                cleaningTasks.length === 0 ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                    No tienes tareas de limpieza asignadas
                  </div>
                ) : null}

                {!cleaningLoading &&
                !cleaningError &&
                cleaningTasks.length > 0 &&
                filteredCleaningTasks.length === 0 ? (
                  <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                    No hay tareas que coincidan con los filtros
                  </div>
                ) : null}

                {!cleaningLoading &&
                !cleaningError &&
                filteredCleaningTasks.length > 0 ? (
                  <>
                    <div className="space-y-4">
                      {paginatedCleaningTasks.map((task) => (
                        <CleaningTaskCard key={task.id} {...task} />
                      ))}
                    </div>
                    <Pagination
                      currentPage={maintenancePage}
                      totalPages={maintenanceTotalPages}
                      onChange={setMaintenancePage}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </section>

        <FloatingReportButton />
      </main>
    </AppLayout>
  );
};
