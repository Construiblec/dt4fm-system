import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { RotateCcw, X } from "lucide-react";
import { reopenCleaningTask } from "@/modules/supervisor/services/supervisorService";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { formatEmployeeName } from "@/shared/utils/nameUtils";

type Props = {
  detail: CleaningTaskDetail;
  onClose: () => void;
  onSuccess: () => void;
};

export const ReopenModal = ({ detail, onClose, onSuccess }: Props) => {
  const [observations, setObservations] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      reopenCleaningTask(detail.id, {
        observations: observations.trim() || undefined,
      }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
    onError: () => {
      setErrorMessage("No se pudo reabrir la tarea. Intenta nuevamente.");
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
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
            <RotateCcw className="h-4 w-4 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Reabrir tarea</h2>
        </div>
        <p className="text-sm text-slate-400">{detail.taskNumber}</p>

        {/* Info */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3 space-y-1 text-sm text-slate-700">
          <p className="font-semibold">{detail.unit?.description ?? detail.description}</p>
          <p className="text-slate-500">{formatEmployeeName(detail.employee?.name)}</p>
          <p className="text-xs text-slate-400">
            Estado actual:{" "}
            <span className="font-medium text-slate-600">{detail.phase}</span>
          </p>
        </div>

        {/* Advertencia */}
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">
            La tarea volverá a <strong>En ejecución</strong>. Los tiempos registrados se conservan.
          </p>
        </div>

        {/* Observaciones anteriores */}
        {detail.supervisionObserv && (
          <div className="mt-4 space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Observaciones de supervisión anteriores
            </label>
            <div className="w-full whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {detail.supervisionObserv}
            </div>
          </div>
        )}

        {/* Observaciones */}
        <div className="mt-4 space-y-1.5">
          <label className="text-sm font-medium text-slate-700">
            Motivo de reapertura{" "}
            <span className="text-slate-400">(opcional)</span>
          </label>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ej: Faltan fotos de la cocina, se necesita completar la limpieza..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 resize-none"
          />
          <p className="text-right text-xs text-slate-400">{observations.length}/500</p>
        </div>

        {/* Acción */}
        <div className="mt-5">
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Confirmar reapertura
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={onClose}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>

      <LoadingModal open={mutation.isPending} message="Reabriendo tarea..." />
      <ErrorModal
        open={errorMessage !== null}
        title="Error al reabrir"
        message={errorMessage ?? ""}
        onClose={() => setErrorMessage(null)}
      />
    </>
  );
};
