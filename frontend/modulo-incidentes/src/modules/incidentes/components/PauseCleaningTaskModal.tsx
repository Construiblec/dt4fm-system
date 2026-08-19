import { useState } from "react";
import { PauseCircle } from "lucide-react";

type Props = {
  open: boolean;
  isSubmitting: boolean;
  elapsedFormatted?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

export const PauseCleaningTaskModal = ({
  open,
  isSubmitting,
  elapsedFormatted,
  onConfirm,
  onCancel,
}: Props) => {
  const [reason, setReason] = useState("");

  // Se desmonta al cerrarse, así que el formulario nace limpio en cada apertura
  if (!open) {
    return null;
  }

  const canConfirm = reason.trim() !== "" && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
            <PauseCircle className="h-4 w-4 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Pausar tarea</h2>
        </div>

        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-700">
            {elapsedFormatted
              ? `Se guardarán ${elapsedFormatted} de trabajo. Al reanudar, el cronómetro sigue desde ahí.`
              : "El tiempo trabajado queda guardado. Al reanudar, el cronómetro sigue desde ahí."}
          </p>
        </div>

        <div className="mt-4 space-y-1.5">
          <label
            htmlFor="cleaning-pause-reason"
            className="text-sm font-medium text-slate-700"
          >
            Motivo de la pausa
          </label>
          <textarea
            id="cleaning-pause-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
            placeholder="Explica por qué se pausa la tarea"
            className={`${FIELD_CLASS} resize-none`}
          />
          <p className="text-right text-xs text-slate-400">{reason.length}/500</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            disabled={!canConfirm}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
              canConfirm
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "cursor-not-allowed bg-slate-300"
            }`}
          >
            {isSubmitting ? "Pausando..." : "Confirmar pausa"}
          </button>
        </div>
      </div>
    </div>
  );
};
