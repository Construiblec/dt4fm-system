import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { useTaskDetail } from "@/modules/supervisor/hooks/useTaskDetail";
import { TaskDetailInfo } from "@/modules/supervisor/components/TaskDetailInfo";
import { TaskDetailChecklist } from "@/modules/supervisor/components/TaskDetailChecklist";
import { TaskDetailPhotos } from "@/modules/supervisor/components/TaskDetailPhotos";
import { ReviewModal } from "@/modules/supervisor/components/ReviewModal";
import { ReopenModal } from "@/modules/supervisor/components/ReopenModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { ArrowLeft, ClipboardCheck, RotateCcw } from "lucide-react";

export const SupervisorTaskDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const taskId = Number(id);

  const { detail, attachments, loading, error, reload } = useTaskDetail(taskId);
  const [showReviewModal, setShowReviewModal] = useState(false);
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
              {detail?.taskNumber ?? "Cargando..."}
            </h1>
          </div>
        </header>

        <div className="space-y-4 px-4 pt-4">
          {/* Error */}
          {!loading && error && (
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

              {/* Checklist */}
              {detail.checklistDetail && (
                <TaskDetailChecklist
                  activities={detail.checklistDetail.activities}
                  templateName={detail.checklistDetail.templateName}
                />
              )}

              {/* Acciones del supervisor */}
              <div className="space-y-3 pb-4">
                {/* Revisar — solo si canReview (Completed) */}
                {detail.canReview && (
                  <button
                    type="button"
                    onClick={() => setShowReviewModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-sm font-bold text-white shadow-md transition hover:bg-violet-700"
                  >
                    <ClipboardCheck className="h-5 w-5" />
                    Revisar y aprobar tarea
                  </button>
                )}

                {/* Reabrir — solo si está Revisada */}
                {detail.canReopen && detail.phase === "Reviewed" && (
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

      {/* Review modal */}
      {showReviewModal && detail && (
        <ReviewModal
          task={{
            id: detail.id,
            type: detail.type as "CleaningTask",
            taskNumber: detail.taskNumber,
            description: detail.description,
            phase: detail.phase,
            generatedDate: detail.generatedDate,
            assignedDate: detail.assignedDate ?? "",
            plannedStartTime: detail.plannedStartTime ?? "",
            plannedEndTime: detail.plannedEndTime ?? "",
            actualStartTime: detail.actualStartTime,
            actualEndTime: detail.actualEndTime,
            observations: detail.observations,
            hostawayReservation: detail.hostawayReservation,
            checkoutDate: detail.checkoutDate,
            source: detail.source,
            unit: detail.unit,
            employee: detail.employee ?? { id: 0, name: "Sin asignar" },
          }}
          onClose={() => setShowReviewModal(false)}
          onSuccess={() => {
            setShowReviewModal(false);
            void reload();
          }}
        />
      )}

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
