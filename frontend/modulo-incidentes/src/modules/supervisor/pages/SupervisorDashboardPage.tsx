import { useEffect, useState } from "react";
import { AppLayout } from "@/app/layout/AppLayout";
import { AppHeader } from "@/shared/components/AppHeader";
import { useSupervisorTasks } from "@/modules/supervisor/hooks/useSupervisorTasks";
import { SupervisorTaskCard } from "@/modules/supervisor/components/SupervisorTaskCard";
import { SupervisorFilters } from "@/modules/supervisor/components/SupervisorFilters";
import { FloatingReportButton } from "@/modules/incidentes/components/FloatingReportButton";
import { ReviewModal } from "@/modules/supervisor/components/ReviewModal";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { ClipboardList } from "lucide-react";

export const SupervisorDashboardPage = () => {
  const { tasks, loading, error, total, filters, load, applyFilters, clearFilters } =
    useSupervisorTasks();
  const [taskToReview, setTaskToReview] = useState<CleaningTask | null>(null);

  useEffect(() => {
    void load({});
  }, [load]);

  const handleReviewSuccess = (taskId: number, approved: boolean) => {
    // Actualiza la fase localmente sin refetch para evitar parpadeo
    void load({
      phase: filters.phase || undefined,
      date: filters.date || undefined,
      employeeId: filters.employeeId ? Number(filters.employeeId) : undefined,
    });
    console.info(`Tarea ${taskId} ${approved ? "aprobada" : "rechazada"}`);
  };

  const pendingReview = tasks.filter((t) => t.phase === "Completed").length;

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen flex flex-col bg-gray-100">
        <AppHeader />

        {/* Deja pasar el botón flotante; la barra inferior la reserva AppLayout. */}
        <section className="flex-1 px-4 pb-20">
          <div className="mx-auto w-full max-w-sm space-y-5">
            <h1 className="text-center text-2xl font-bold text-slate-900">
              Supervisor de Tareas de Limpieza
            </h1>

            {/* Stats bar */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-white p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-slate-900">{total}</p>
                <p className="text-xs text-slate-400 mt-0.5">Total</p>
              </div>
              <div className="flex-1 rounded-xl bg-violet-50 p-3 shadow-sm text-center">
                <p className="text-2xl font-bold text-violet-700">{pendingReview}</p>
                <p className="text-xs text-violet-400 mt-0.5">Por revisar</p>
              </div>
            </div>

            {/* Filters */}
            <SupervisorFilters
              phase={filters.phase}
              date={filters.date}
              onPhaseChange={(phase) => applyFilters({ phase })}
              onDateChange={(date) => applyFilters({ date })}
              onClear={clearFilters}
            />

            {/* Loading */}
            {loading && (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
                Cargando tareas...
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
                {error}
              </div>
            )}

            {/* Empty */}
            {!loading && !error && tasks.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-white p-8 shadow-sm text-center">
                <ClipboardList className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-400">
                  No hay tareas con los filtros actuales
                </p>
              </div>
            )}

            {/* Task list */}
            {!loading && !error && tasks.length > 0 && (
              <div className="space-y-4">
                {tasks.map((task) => (
                  <SupervisorTaskCard
                    key={task.id}
                    task={task}
                    onReview={setTaskToReview}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <FloatingReportButton />
      </main>

      {/* Review modal */}
      {taskToReview && (
        <ReviewModal
          task={taskToReview}
          onClose={() => setTaskToReview(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
    </AppLayout>
  );
};
