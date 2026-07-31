import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle, XCircle, X } from "lucide-react";
import { reviewCleaningTask } from "@/modules/supervisor/services/supervisorService";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { cleanObservationText } from "@/shared/utils/textUtils";

type Props = {
  task: CleaningTask;
  onClose: () => void;
  onSuccess: (taskId: number, approved: boolean) => void;
};

export const ReviewModal = ({ task, onClose, onSuccess }: Props) => {
  const [comments, setComments] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (approved: boolean) =>
      reviewCleaningTask(task.id, {
        approved,
        reviewComments: comments.trim() || undefined,
      }),
    onSuccess: (_, approved) => {
      onSuccess(task.id, approved);
      onClose();
    },
    onError: () => {
      setErrorMessage("No se pudo procesar la revisión. Intenta nuevamente.");
    },
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl max-w-sm mx-auto">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <h2 className="text-lg font-bold text-slate-900">Revisión de tarea</h2>
        <p className="mt-1 text-sm text-slate-500">{task.taskNumber}</p>

        {/* Task info */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 space-y-1 text-sm text-slate-700">
          <p className="font-semibold">{task.unit?.description ?? task.description}</p>
          <p className="text-slate-500">{formatEmployeeName(task.employee?.name)}</p>
          {task.teamObservations && (
            <p className="italic whitespace-pre-line text-slate-400">"{cleanObservationText(task.teamObservations)}"</p>
          )}
        </div>

        {/* Comments */}
        <div className="mt-4 space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Comentarios <span className="text-slate-400">(opcional)</span>
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            placeholder="Agrega observaciones de la revisión..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" />
            Reabrir
          </button>

          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            Aprobar
          </button>
        </div>
      </div>

      <LoadingModal open={mutation.isPending} message="Procesando revisión..." />
      <ErrorModal
        open={errorMessage !== null}
        title="Error al revisar"
        message={errorMessage ?? ""}
        onClose={() => setErrorMessage(null)}
      />
    </>
  );
};
