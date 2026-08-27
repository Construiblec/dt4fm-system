import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";

type Props = {
  title: string;
  subtitle?: string;
  /** Texto del aviso que explica la consecuencia de confirmar */
  warning: string;
  /** `danger` para acciones que cierran; `neutral` para las que devuelven */
  tone?: "danger" | "neutral";
  confirmLabel: string;
  placeholder?: string;
  onConfirm: (notes: string) => Promise<void>;
  onClose: () => void;
};

/**
 * Modal de confirmación con motivo obligatorio. Lo comparten las dos acciones
 * de rechazo, que son distintas y conviene no confundir: una **cierra** el
 * correctivo en asignación (queda Cancelado), la otra lo **devuelve** a
 * asignación desde la revisión de cierre.
 */
export const NotesReasonModal = ({
  title,
  subtitle,
  warning,
  tone = "danger",
  confirmLabel,
  placeholder = "Explica el motivo…",
  onConfirm,
  onClose,
}: Props) => {
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = notes.trim().length === 0;

  const handleConfirm = async () => {
    setTouched(true);
    if (isEmpty) return;

    try {
      setSaving(true);
      setError(null);
      await onConfirm(notes.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Motivo
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={placeholder}
              className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-4 ${
                touched && isEmpty
                  ? "border-red-400 focus:border-red-400 focus:ring-red-100"
                  : "border-slate-200 focus:border-brand focus:ring-brand/20"
              }`}
            />
            <p
              className={`mt-1.5 text-xs ${
                touched && isEmpty ? "text-red-600" : "text-slate-400"
              }`}
            >
              {touched && isEmpty
                ? "El motivo es obligatorio."
                : "Queda registrado en la bitácora del proceso."}
            </p>
          </div>

          <div
            className={`flex items-start gap-2 rounded-xl p-3 text-xs ${
              tone === "danger"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {tone === "danger" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Info className="h-4 w-4 shrink-0" />
            )}
            <p>{warning}</p>
          </div>

          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 ${
              tone === "danger"
                ? "bg-red-500 hover:bg-red-600"
                : "bg-brand hover:bg-brand-hover"
            }`}
          >
            {saving ? "Guardando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
