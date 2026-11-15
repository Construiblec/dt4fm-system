import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { useTaskDetail } from "@/modules/supervisor/hooks/useTaskDetail";
import { TaskDetailInfo } from "@/modules/supervisor/components/TaskDetailInfo";
import { TaskDetailChecklist } from "@/modules/supervisor/components/TaskDetailChecklist";
import { TaskDetailPhotos } from "@/modules/supervisor/components/TaskDetailPhotos";
import { SupervisionEvidenceSection } from "@/modules/supervisor/components/SupervisionEvidenceSection";
import { ReopenModal } from "@/modules/supervisor/components/ReopenModal";
import { SupervisionAccess } from "@/modules/supervisor/components/SupervisionAccess";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { ArrowLeft, RotateCcw } from "lucide-react";

export const SupervisorTaskDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const taskId = Number(id);

  const { detail, attachments, loading, error, reload } = useTaskDetail(taskId);
  const [showReopenModal, setShowReopenModal] = useState(false);

  if (!Number.isFinite(taskId) || taskId <= 0) {
    return (
      <AppLayout className="bg-gray-100">
        <div className="p-6 text-sm text-red-600">ID de tarea inválido.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-10">
        {/* Header */}
        <header className="flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
          <button
            type="button"
            onClick={() => navigate("/supervisor")}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Detalle de tarea
            </p>
            <h1 className="text-base font-bold text-slate-900">
              {loading ? "Cargando..." : (detail?.taskNumber || "Sin Número de Tarea")}
            </h1>
          </div>
        </header>

        <div className="space-y-4 px-4 pt-4">
          {/* Error */}
          {!loading && !!error && (
            <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
              {error}
            </div>
          )}

          {detail && (
            <>
              {/* Info general */}
              <TaskDetailInfo detail={detail} />

              {/* Fotos */}
              <TaskDetailPhotos attachments={attachments} />

              {/* Evidencia de supervisión: se edita con la tarea Completed o
                  Reviewed, que es justo cuando se puede reabrir (canReopen). */}
              <SupervisionEvidenceSection
                taskId={taskId}
                attachments={attachments}
                editable={detail.canReopen}
                onChanged={reload}
              />

              {/* Checklist */}
              {detail.checklistDetail && (
                <TaskDetailChecklist
                  activities={detail.checklistDetail.activities}
                  templateName={detail.checklistDetail.description}
                />
              )}

              {/* Acciones del supervisor */}
              <div className="space-y-3 pb-4">
                {/* Supervisión posterior: solo SupervisorLimpieza tiene el panel. */}
                <SupervisionAccess detail={detail} />

                {/* Reabrir: repetir la limpieza entera (Completed o Reviewed). */}
                {detail.canReopen && (
                  <button
                    type="button"
                    onClick={() => setShowReopenModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-700 shadow-sm transition hover:bg-amber-100"
                  >
                    <RotateCcw className="h-5 w-5" />
                    Reabrir tarea
                  </button>
                )}

                {/* Ya revisada — sin botones de acción */}
                {detail.phase === "Reviewed" && !detail.canReopen && (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-700 shadow-sm">
                    ✓ Esta tarea ya fue revisada y aprobada
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <LoadingModal open={loading} message="Cargando detalle..." />
      </main>

      {/* Reopen modal */}
      {showReopenModal && detail && (
        <ReopenModal
          detail={detail}
          onClose={() => setShowReopenModal(false)}
          onSuccess={() => {
            setShowReopenModal(false);
            void reload();
          }}
        />
      )}
    </AppLayout>
  );
};
