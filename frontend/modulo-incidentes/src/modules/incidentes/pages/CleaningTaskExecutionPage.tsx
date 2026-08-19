import { PauseCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { CleaningTaskChecklist } from "@/modules/incidentes/components/CleaningTaskChecklist";
import { CleaningTaskHeader } from "@/modules/incidentes/components/CleaningTaskHeader";
import { CleaningTaskObservations } from "@/modules/incidentes/components/CleaningTaskObservations";
import { CleaningTaskPhotoUpload } from "@/modules/incidentes/components/CleaningTaskPhotoUpload";
import { CleaningTaskTimer } from "@/modules/incidentes/components/CleaningTaskTimer";
import { PauseCleaningTaskModal } from "@/modules/incidentes/components/PauseCleaningTaskModal";
import { useActiveTaskTimer } from "@/modules/incidentes/hooks/useActiveTaskTimer";
import { useCleaningTaskExecution } from "@/modules/incidentes/hooks/useCleaningTaskExecution";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";
import { cleanObservationText } from "@/shared/utils/textUtils";

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
    attachments,
    canPause,
    isPausing,
    pauseModalOpen,
    pauseSuccessOpen,
    successOpen,
    errorMessage,
    setSuccessOpen,
    setPauseModalOpen,
    setPauseSuccessOpen,
    setErrorMessage,
    completeTask,
    pauseTask,
  } = useCleaningTaskExecution(taskId);
  const { elapsedFormatted } = useActiveTaskTimer();

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
              {(taskDetail.taskObservations || taskDetail.supervisionObserv || taskDetail.teamObservations) && (
                <section className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
                  {taskDetail.taskObservations && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-1 text-xs font-semibold text-blue-700">Observaciones de la tarea</p>
                      <p className="whitespace-pre-line text-sm text-blue-900 italic">"{cleanObservationText(taskDetail.taskObservations)}"</p>
                    </div>
                  )}

                  {taskDetail.supervisionObserv && (
                    <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                      <p className="mb-1 text-xs font-semibold text-violet-700">Observaciones de supervisión</p>
                      <p className="whitespace-pre-line text-sm text-violet-900 italic">"{cleanObservationText(taskDetail.supervisionObserv)}"</p>
                    </div>
                  )}

                  {taskDetail.teamObservations && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                      <p className="mb-1 text-xs font-semibold text-amber-700">Observaciones del empleado</p>
                      <p className="whitespace-pre-line text-sm text-amber-900 italic">"{cleanObservationText(taskDetail.teamObservations)}"</p>
                    </div>
                  )}
                </section>
              )}

              <CleaningTaskTimer />
              <CleaningTaskChecklist
                activities={taskDetail.checklistDetail?.activities ?? []}
              />


              <CleaningTaskObservations />
              <CleaningTaskPhotoUpload
                taskId={taskId}
                attachments={attachments}
                onError={setErrorMessage}
              />

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

                {canPause ? (
                  <button
                    type="button"
                    onClick={() => setPauseModalOpen(true)}
                    disabled={isCompleting || isPausing}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Pausar tarea
                  </button>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <PauseCleaningTaskModal
          open={pauseModalOpen}
          isSubmitting={isPausing}
          elapsedFormatted={elapsedFormatted}
          onConfirm={pauseTask}
          onCancel={() => setPauseModalOpen(false)}
        />
        <LoadingModal
          open={isLoading || isCompleting || isPausing}
          message={
            isCompleting
              ? "Finalizando tarea..."
              : isPausing
                ? "Pausando tarea..."
                : "Cargando tarea..."
          }
        />
        <SuccessModal
          open={pauseSuccessOpen}
          incidentId={taskId}
          title="Tarea pausada"
          message="El tiempo trabajado quedó guardado. Al reanudar, el cronómetro continúa desde ahí."
          buttonLabel="Volver al Dashboard"
          onClose={() => {
            setPauseSuccessOpen(false);
            navigate("/dashboard");
          }}
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
