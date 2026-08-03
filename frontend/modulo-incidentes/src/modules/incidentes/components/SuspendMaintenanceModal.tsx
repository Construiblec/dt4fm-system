import { useState } from "react";
import { PauseCircle } from "lucide-react";
import type { SuspensionReason } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = {
  open: boolean;
  reasons: SuspensionReason[];
  loadingReasons: boolean;
  isSubmitting: boolean;
  onConfirm: (reasonId: string, notes: string) => void;
  onCancel: () => void;
};

const FIELD_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

export const SuspendMaintenanceModal = ({
  open,
  reasons,
  loadingReasons,
  isSubmitting,
  onConfirm,
  onCancel,
}: Props) => {
  const [reasonId, setReasonId] = useState("");
  const [notes, setNotes] = useState("");

  // Se desmonta al cerrarse, así que el formulario nace limpio en cada apertura
  if (!open) {
    return null;
  }

  const canConfirm = reasonId !== "" && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
            <PauseCircle className="h-4 w-4 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            Suspender mantenimiento
          </h2>
        </div>

        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">
            Las actividades del checklist sin completar se registrarán como{" "}
            <strong>N.D.</strong> y volverán a estar pendientes al reanudar.
          </p>
        </div>

        <div className="mt-4 space-y-1.5">
          <label
            htmlFor="suspension-reason"
            className="text-sm font-medium text-slate-700"
          >
            Motivo de suspensión
          </label>
          <select
            id="suspension-reason"
            value={reasonId}
            disabled={loadingReasons || isSubmitting}
            onChange={(event) => setReasonId(event.target.value)}
            className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:bg-slate-50`}
          >
            <option value="">
              {loadingReasons ? "Cargando motivos..." : "Selecciona un motivo"}
            </option>
            {reasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 space-y-1.5">
          <label
            htmlFor="suspension-notes"
            className="text-sm font-medium text-slate-700"
          >
            Notas <span className="text-slate-400">(opcional)</span>
          </label>
          <textarea
            id="suspension-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
            disabled={isSubmitting}
            placeholder="Detalla por qué se suspende el mantenimiento"
            className={`${FIELD_CLASS} resize-none`}
          />
          <p className="text-right text-xs text-slate-400">
            {notes.length}/500
          </p>
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
            onClick={() => onConfirm(reasonId, notes)}
            disabled={!canConfirm}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
              canConfirm
                ? "bg-amber-500 hover:bg-amber-600"
                : "cursor-not-allowed bg-slate-300"
            }`}
          >
            Suspender
          </button>
        </div>
      </div>
    </div>
  );
};
