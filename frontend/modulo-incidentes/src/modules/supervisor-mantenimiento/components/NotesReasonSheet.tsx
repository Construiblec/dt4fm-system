import { AlertTriangle, Info } from "lucide-react";
import { useId, useState } from "react";
import { BottomSheet } from "@/shared/components/BottomSheet";

type Props = {
  title: string;
  subtitle?: string;
  /** Explica qué pasa al confirmar */
  warning: string;
  /** `danger` para acciones que cierran; `neutral` para las que reabren */
  tone?: "danger" | "neutral";
  confirmLabel: string;
  placeholder?: string;
  onConfirm: (notes: string) => Promise<void>;
  onClose: () => void;
};

/** Hoja inferior con motivo obligatorio para rechazar o reabrir un correctivo. */
export const NotesReasonSheet = ({
  title,
  subtitle,
  warning,
  tone = "danger",
  confirmLabel,
  placeholder = "Explica el motivo…",
  onConfirm,
  onClose,
}: Props) => {
  const fieldId = useId();
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = notes.trim().length === 0;
  const isDanger = tone === "danger";

  const handleConfirm = async () => {
    setTouched(true);
    if (isEmpty) return;

    try {
      setSaving(true);
      setError(null);
      await onConfirm(notes.trim());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo completar la acción",
      );
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title={title}
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-4 px-5">
        {subtitle ? (
          <p className="-mt-1 text-sm text-slate-600">{subtitle}</p>
        ) : null}

        <div
          className={`flex items-start gap-2 rounded-2xl border p-3.5 text-sm ${
            isDanger
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          {isDanger ? (
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
              aria-hidden
            />
          ) : (
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-slate-600"
              aria-hidden
            />
          )}
          <p>{warning}</p>
        </div>

        <div>
          <label
            htmlFor={fieldId}
            className="mb-1.5 block text-sm font-bold text-slate-900"
          >
            Motivo{" "}
            <span className="font-normal text-slate-600">(obligatorio)</span>
          </label>
          <textarea
            id={fieldId}
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={placeholder}
            aria-invalid={touched && isEmpty}
            aria-describedby={`${fieldId}-help`}
            className={`w-full resize-none rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:ring-4 ${
              touched && isEmpty
                ? "border-red-500 focus:ring-red-100"
                : "border-slate-400 focus:border-brand focus:ring-brand/20"
            }`}
          />
          <p
            id={`${fieldId}-help`}
            className={`mt-1.5 text-xs ${touched && isEmpty ? "text-red-700" : "text-slate-600"}`}
          >
            {touched && isEmpty
              ? "Escribe el motivo para continuar."
              : "Quedará en las notas del correctivo."}
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className={`min-h-12 rounded-2xl px-4 text-sm font-semibold text-white transition disabled:opacity-60 ${
              isDanger
                ? "bg-red-700 hover:bg-red-800"
                : "bg-slate-900 hover:bg-slate-800"
            }`}
          >
            {saving ? "Guardando..." : confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
