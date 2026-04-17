import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { CleaningTaskChecklist } from "@/modules/incidentes/components/CleaningTaskChecklist";
import { CleaningTaskHeader } from "@/modules/incidentes/components/CleaningTaskHeader";
import { CleaningTaskObservations } from "@/modules/incidentes/components/CleaningTaskObservations";
import { CleaningTaskPhotoUpload } from "@/modules/incidentes/components/CleaningTaskPhotoUpload";
import { CleaningTaskTimer } from "@/modules/incidentes/components/CleaningTaskTimer";
import { useCleaningTaskExecution } from "@/modules/incidentes/hooks/useCleaningTaskExecution";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";

export const CleaningTaskExecutionPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const taskId = Number(id);
  const {
    taskDetail,
    isLoading,
    loadError,
    totalActivities,
    completedActivities,
    canComplete,
    validationMessage,
    isCompleting,
    successOpen,
    errorMessage,
    setSuccessOpen,
    setErrorMessage,
    completeTask,
  } = useCleaningTaskExecution(taskId);

  if (!Number.isFinite(taskId) || taskId <= 0) {
    return (
      <AppLayout className="bg-[#f1f1f2]">
        <main className="min-h-screen bg-[#f1f1f2] px-4 py-6">
          <section className="rounded-3xl bg-white p-5 text-sm text-red-600 shadow-sm">
            La tarea solicitada no es valida.
          </section>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2] pb-8">
        {taskDetail ? <CleaningTaskHeader task={taskDetail} /> : null}

        <div className="space-y-5 px-4 py-5">
          {!isLoading && loadError ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-600 shadow-sm">
              {loadError}
            </section>
          ) : null}

          {taskDetail ? (
            <>
              <CleaningTaskTimer />
              <CleaningTaskChecklist
                activities={taskDetail.checklistDetail?.activities ?? []}
              />
              <CleaningTaskObservations />
              <CleaningTaskPhotoUpload taskId={taskId} onError={setErrorMessage} />

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {completedActivities}/{totalActivities} actividades completadas
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    {validationMessage ??
                      "Checklist completo y evidencia registrada. Ya puedes finalizar la tarea."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={completeTask}
                  disabled={!canComplete || isCompleting}
                  className={`mt-4 w-full rounded-2xl px-4 py-4 text-sm font-semibold text-white shadow-sm transition ${
                    canComplete && !isCompleting
                      ? "bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                      : "cursor-not-allowed bg-slate-300"
                  }`}
                >
                  {isCompleting ? "Finalizando tarea..." : "Finalizar tarea"}
                </button>
              </section>
            </>
          ) : null}
        </div>

        <LoadingModal
          open={isLoading || isCompleting}
          message={isCompleting ? "Finalizando tarea..." : "Cargando tarea..."}
        />
        <SuccessModal
          open={successOpen}
          incidentId={taskId}
          title="Tarea completada exitosamente"
          message="La tarea de limpieza fue finalizada correctamente."
          buttonLabel="Volver al Dashboard"
          onClose={() => {
            setSuccessOpen(false);
            navigate("/dashboard");
          }}
        />
        <ErrorModal
          open={errorMessage !== null}
          title="No se pudo continuar con la tarea"
          message={errorMessage ?? "No se pudo continuar con la tarea"}
          onClose={() => setErrorMessage(null)}
        />
      </main>
    </AppLayout>
  );
};
