import { AppLayout } from "@/app/layout/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { isSupplier } from "@/shared/auth/session";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { CleaningTaskCard } from "@/modules/incidentes/components/CleaningTaskCard";
import { ListStateMessage } from "@/modules/incidentes/components/ListStateMessage";
import {
  MaintenanceFilters,
  type MaintenanceStatusFilter,
} from "@/modules/incidentes/components/MaintenanceFilters";
import { CleaningFilters } from "@/modules/incidentes/components/CleaningFilters";
import { PreventiveFilters } from "@/modules/incidentes/components/PreventiveFilters";
import { getCorrectiveBlockedReason } from "@/modules/incidentes/constants/correctiveStatus";
import { MaintenanceCard } from "@/shared/components/MaintenanceCard";
import { useListPagination } from "@/modules/incidentes/hooks/useListPagination";
import { useMyPreventiveMaintenances } from "@/modules/incidentes/hooks/useMyPreventiveMaintenances";
import { getMyIncidents } from "@/modules/incidentes/services/incidentsService";
import { fetchMyCleaningTasks } from "@/modules/incidentes/services/cleaningTasksService";
import type { Incident } from "@/modules/incidentes/types/Incident";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import {
  isActiveCleaningTaskPhase,
  useCleaningTaskExecutionStore,
} from "@/store/cleaningTaskExecutionStore";
import { Pagination } from "@/shared/components/Pagination";

type Tab = "maintenance" | "cleaning";
type MaintenanceKind = "corrective" | "preventive";

const ITEMS_PER_PAGE = 5;

export const DashboardPage = () => {
  const logout = useLogout();
  const navigate = useNavigate();
  const supplierUser = useMemo(() => isSupplier(), []);
  const syncActiveTask = useCleaningTaskExecutionStore(
    (state) => state.syncActiveTask,
  );
  const clearActiveTask = useCleaningTaskExecutionStore(
    (state) => state.clearActiveTask,
  );
  const releaseActiveTask = useCleaningTaskExecutionStore(
    (state) => state.releaseActiveTask,
  );
  const contextTaskId = useCleaningTaskExecutionStore(
    (state) => state.contextTaskId,
  );

  // ── Tab activo ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("maintenance");
  const [maintenanceKind, setMaintenanceKind] =
    useState<MaintenanceKind>("corrective");

  // ── Estado: incidentes de mantenimiento correctivo ─────────────────────────
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de mantenimiento correctivo
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] =
    useState<MaintenanceStatusFilter>("ALL");

  // ── Estado: mantenimientos preventivos ─────────────────────────────────────
  // Se cargan solo al abrir el sub-tab, no al montar el dashboard.
  const {
    maintenances: preventives,
    loading: preventiveLoading,
    error: preventiveError,
  } = useMyPreventiveMaintenances(
    activeTab === "maintenance" && maintenanceKind === "preventive",
  );
  const [preventiveStatusFilter, setPreventiveStatusFilter] =
    useState<string>("ALL");

  // ── Estado: tareas de limpieza ─────────────────────────────────────────────
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [cleaningLoading, setCleaningLoading] = useState(true);
  const [cleaningError, setCleaningError] = useState<string | null>(null);

  // Filtros de limpieza
  const [phaseFilter, setPhaseFilter] = useState<string>("ALL");

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
    // Los proveedores no manejan limpiezas; evitar la llamada.
    if (supplierUser) {
      setCleaningLoading(false);
      return;
    }

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
  }, [supplierUser]);

  // ── Sincronización con el store de tarea activa ────────────────────────────
  useEffect(() => {
    if (supplierUser) return;
    if (cleaningLoading) return;

    if (cleaningError) {
      clearActiveTask();
      return;
    }

    const backendActiveTask = cleaningTasks.find((task) =>
      isActiveCleaningTaskPhase(task.phase),
    );

    if (!backendActiveTask) {
      // Una tarea pausada tampoco está activa, pero su checklist, observaciones y
      // foto deben sobrevivir hasta que se reanude.
      const isContextTaskPaused = cleaningTasks.some(
        (task) => task.id === contextTaskId && task.isPaused,
      );

      if (isContextTaskPaused) {
        releaseActiveTask();
        return;
      }

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
      // Cero del cronómetro según OpenMAINT. Sin esto, una ventana recién abierta
      // no tenía de dónde sacarlo y empezaba a contar desde cero.
      sessionStartedAt: backendActiveTask.sessionStartedAt,
      sessionBaseMinutes: backendActiveTask.sessionBaseMinutes ?? 0,
      accumulatedMinutes: backendActiveTask.executionTime ?? 0,
      plannedStartTime: backendActiveTask.plannedStartTime,
      plannedEndTime: backendActiveTask.plannedEndTime,
      unitDescription:
        backendActiveTask.unit?.description ?? backendActiveTask.description,
    });

  }, [
    supplierUser,
    cleaningLoading,
    cleaningError,
    cleaningTasks,
    clearActiveTask,
    contextTaskId,
    releaseActiveTask,
    syncActiveTask,
  ]);

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filteredIncidents = incidents.filter((incident) => {
    const matchPriority =
      priorityFilter === "ALL" || incident.priority === priorityFilter;
    const matchStatus =
      statusFilter === "ALL" ||
      (statusFilter === "Execution" && incident.statusCode === "Execution") ||
      (statusFilter === "Otros" && incident.statusCode !== "Execution");
    return matchPriority && matchStatus;
  });

  const filteredPreventives = preventives.filter(
    (maintenance) =>
      preventiveStatusFilter === "ALL" ||
      maintenance.statusCode === preventiveStatusFilter,
  );

  const filteredCleaningTasks = cleaningTasks.filter((task) => {
    const allowedPhases = ["Assigned", "InExecution", "Completed"];
    if (!allowedPhases.includes(task.phase)) return false;
    return phaseFilter === "ALL" || task.phase === phaseFilter;
  });

  // ── Paginación ─────────────────────────────────────────────────────────────
  const maintenancePagination = useListPagination(
    filteredIncidents,
    ITEMS_PER_PAGE,
    `${priorityFilter}|${statusFilter}`,
  );

  const preventivePagination = useListPagination(
    filteredPreventives,
    ITEMS_PER_PAGE,
    preventiveStatusFilter,
  );

  const cleaningPagination = useListPagination(
    filteredCleaningTasks,
    ITEMS_PER_PAGE,
    phaseFilter,
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
              <p className="text-base font-medium text-slate-900">
                Bienvenido, {(localStorage.getItem("username") || "Usuario").split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')}
              </p>
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
            <h1 className="text-center text-2xl font-bold text-slate-900">
              {supplierUser ? "Mantenimientos" : "Mantenimiento y Limpieza"}
            </h1>

            <h2 className="text-xl font-bold text-slate-900">Mis tareas</h2>

            {/* Tab switcher — oculto para proveedores (solo ven mantenimiento) */}
            {!supplierUser && (
              <div className="flex rounded-xl bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab("maintenance")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${activeTab === "maintenance"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  Mantenimiento
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("cleaning")}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${activeTab === "cleaning"
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:text-slate-700"
                    }`}
                >
                  Limpieza
                </button>
              </div>
            )}

            {/* ── Tab: Mantenimiento ─────────────────────────────────────── */}
            {activeTab === "maintenance" ? (
              <>
                {/* Sub-tabs: correctivo / preventivo */}
                <div className="flex rounded-xl bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setMaintenanceKind("corrective")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${maintenanceKind === "corrective"
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    Correctivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaintenanceKind("preventive")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${maintenanceKind === "preventive"
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:text-slate-700"
                      }`}
                  >
                    Preventivo
                  </button>
                </div>

                {/* ── Correctivo ─────────────────────────────────────────── */}
                {maintenanceKind === "corrective" ? (
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

                    <ListStateMessage
                      loading={loading}
                      error={error}
                      isEmpty={incidents.length === 0}
                      hasNoMatches={filteredIncidents.length === 0}
                      loadingMessage="Cargando incidentes..."
                      emptyMessage="No tienes incidentes asignados"
                      noMatchesMessage="No hay incidentes que coincidan con los filtros"
                    />

                    {!loading && !error && filteredIncidents.length > 0 ? (
                      <>
                        <div className="space-y-4">
                          {maintenancePagination.pageItems.map((incident) => (
                            <MaintenanceCard
                              key={incident.id}
                              maintenance={{
                                id: incident.id,
                                kind: "corrective",
                                number: incident.number,
                                subject: incident.building,
                                statusCode: incident.statusCode,
                                status: incident.status,
                                site: incident.building,
                                target: incident.location,
                                assignee: null,
                                priorityCode: incident.priority,
                                openingDate: incident.createdAt,
                                plannedStart: incident.plannedStart,
                                dueDate: null,
                                isOverdue: false,
                              }}
                              onOpen={() =>
                                navigate(`/incidents/${incident.id}`)
                              }
                              // El técnico solo entra a lo que está en ejecución;
                              // el motivo se ajusta al estado real de la tarea.
                              disabledReason={getCorrectiveBlockedReason(
                                incident.statusCode,
                              )}
                            />
                          ))}
                        </div>
                        <Pagination
                          currentPage={maintenancePagination.page}
                          totalPages={maintenancePagination.totalPages}
                          onChange={maintenancePagination.setPage}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}

                {/* ── Preventivo ─────────────────────────────────────────── */}
                {maintenanceKind === "preventive" ? (
                  <>
                    {!preventiveLoading &&
                      !preventiveError &&
                      preventives.length > 0 ? (
                      <PreventiveFilters
                        statusFilter={preventiveStatusFilter}
                        onStatusChange={setPreventiveStatusFilter}
                        onClear={() => setPreventiveStatusFilter("ALL")}
                      />
                    ) : null}

                    <ListStateMessage
                      loading={preventiveLoading}
                      error={preventiveError}
                      isEmpty={preventives.length === 0}
                      hasNoMatches={filteredPreventives.length === 0}
                      loadingMessage="Cargando mantenimientos preventivos..."
                      emptyMessage="No tienes mantenimientos preventivos asignados"
                      noMatchesMessage="No hay mantenimientos que coincidan con los filtros"
                    />

                    {!preventiveLoading &&
                      !preventiveError &&
                      filteredPreventives.length > 0 ? (
                      <>
                        <div className="space-y-4">
                          {preventivePagination.pageItems.map((maintenance) => {
                            // Reanudar un suspendido se hace en OpenMAINT
                            const isSuspended =
                              maintenance.statusCode === "Suspension";

                            return (
                              <MaintenanceCard
                                key={maintenance.id}
                                maintenance={{
                                  id: maintenance.id,
                                  kind: "preventive",
                                  number: maintenance.number,
                                  subject: maintenance.subject,
                                  statusCode: maintenance.statusCode,
                                  status: maintenance.status,
                                  site: maintenance.site,
                                  target: maintenance.equipment,
                                  assignee: null,
                                  priorityCode: null,
                                  openingDate: maintenance.dueDate,
                                  plannedStart: maintenance.expectedStartDate,
                                  dueDate: maintenance.dueDate,
                                  isOverdue: maintenance.isOverdue,
                                }}
                                onOpen={() =>
                                  navigate(
                                    `/preventive-maintenance/${maintenance.id}`,
                                  )
                                }
                                disabledReason={
                                  isSuspended
                                    ? "Se reanuda desde OpenMAINT"
                                    : null
                                }
                              />
                            );
                          })}
                        </div>
                        <Pagination
                          currentPage={preventivePagination.page}
                          totalPages={preventivePagination.totalPages}
                          onChange={preventivePagination.setPage}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {/* ── Tab: Limpieza (oculto para proveedores) ─────────────────── */}
            {!supplierUser && activeTab === "cleaning" ? (
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

                <ListStateMessage
                  loading={cleaningLoading}
                  error={cleaningError}
                  isEmpty={cleaningTasks.length === 0}
                  hasNoMatches={filteredCleaningTasks.length === 0}
                  loadingMessage="Cargando tareas de limpieza..."
                  emptyMessage="No tienes tareas de limpieza asignadas"
                  noMatchesMessage="No hay tareas que coincidan con los filtros"
                />

                {!cleaningLoading &&
                  !cleaningError &&
                  filteredCleaningTasks.length > 0 ? (
                  <>
                    <div className="space-y-4">
                      {cleaningPagination.pageItems.map((task) => (
                        <CleaningTaskCard key={task.id} {...task} />
                      ))}
                    </div>
                    <Pagination
                      currentPage={cleaningPagination.page}
                      totalPages={cleaningPagination.totalPages}
                      onChange={cleaningPagination.setPage}
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
