import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { ListStateMessage } from "@/modules/incidentes/components/ListStateMessage";
import { SupervisionFilters } from "@/modules/supervisor-mantenimiento/components/SupervisionFilters";
import { useSupervisedMaintenances } from "@/modules/supervisor-mantenimiento/hooks/useSupervisedMaintenances";
import type { MaintenanceKind } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { toCardData } from "@/modules/supervisor-mantenimiento/utils/toMaintenanceCard";
import { AppHeader } from "@/shared/components/AppHeader";
import { MaintenanceCard } from "@/shared/components/MaintenanceCard";
import { Pagination } from "@/shared/components/Pagination";

export const MaintenanceSupervisorDashboardPage = () => {
  const navigate = useNavigate();
  // El deep link de una notificación preselecciona el tipo: ?kind=preventive
  const [searchParams] = useSearchParams();
  const [kind, setKind] = useState<MaintenanceKind>(() =>
    searchParams.get("kind") === "preventive" ? "preventive" : "corrective",
  );

  const {
    items,
    total,
    pendingReview,
    unassigned,
    loading,
    error,
    status,
    changeStatus,
    from,
    to,
    applyDateRange,
    clearFilters,
    page,
    setPage,
    totalPages,
  } = useSupervisedMaintenances(kind);

  const switchKind = (next: MaintenanceKind) => {
    if (next === kind) return;
    // El filtro de estado no es compartido: los códigos difieren entre flujos.
    clearFilters();
    setKind(next);
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="flex min-h-screen flex-col bg-gray-100">
        <AppHeader />

        {/* Deja pasar el botón flotante; la barra inferior la reserva AppLayout. */}
        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <h1 className="text-center text-2xl font-bold text-slate-900">
              Supervisor de Mantenimiento
            </h1>

            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-white p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-slate-900">{total}</p>
                <p className="mt-0.5 text-xs text-slate-400">Total</p>
              </div>

              {/* Trabajo pendiente de despachar; no depende del filtro activo */}
              {unassigned !== null ? (
                <div className="flex-1 rounded-xl bg-rose-50 p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-rose-700">
                    {unassigned}
                  </p>
                  <p className="mt-0.5 text-xs text-rose-500">Sin asignar</p>
                </div>
              ) : null}

              {/* El preventivo no tiene paso de revisión: el backend manda null */}
              {pendingReview !== null ? (
                <div className="flex-1 rounded-xl bg-amber-50 p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-amber-700">
                    {pendingReview}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-500">Por revisar</p>
                </div>
              ) : null}
            </div>

            <div className="flex rounded-xl bg-white p-1 shadow-sm">
              {(["corrective", "preventive"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => switchKind(option)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                    kind === option
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {option === "corrective" ? "Correctivo" : "Preventivo"}
                </button>
              ))}
            </div>

            <SupervisionFilters
              kind={kind}
              status={status}
              onStatusChange={changeStatus}
              from={from}
              to={to}
              onDateRangeApply={applyDateRange}
              onClear={clearFilters}
            />

            <ListStateMessage
              loading={loading}
              error={error}
              isEmpty={items.length === 0}
              hasNoMatches={items.length === 0}
              loadingMessage="Cargando mantenimientos..."
              emptyMessage="No hay mantenimientos con los filtros actuales"
              noMatchesMessage="No hay mantenimientos con los filtros actuales"
            />

            {!loading && !error && items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 text-center shadow-sm">
                <ClipboardList className="h-10 w-10 text-slate-300" />
              </div>
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <>
                <div className="space-y-4">
                  {items.map((maintenance) => (
                    <MaintenanceCard
                      key={`${maintenance.kind}-${maintenance.id}`}
                      maintenance={toCardData(maintenance)}
                      showAssignee
                      onOpen={() =>
                        navigate(
                          `/supervisor-mantenimiento/${maintenance.kind}/${maintenance.id}`,
                        )
                      }
                    />
                  ))}
                </div>

                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              </>
            ) : null}
          </div>
        </section>

        <FloatingReportButton />
      </main>
    </AppLayout>
  );
};
