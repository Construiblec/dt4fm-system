import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { CreateChecklistTemplatePayload } from "@/modules/coordinador/types/Coordinador";

type Props = {
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateChecklistTemplatePayload) => void;
};

const FIELD_CLASSES =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

export const ChecklistTemplateFormModal = ({
  open,
  submitting,
  onClose,
  onSubmit,
}: Props) => {
  const [templateName, setTemplateName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const updateStep = (index: number, value: string) => {
    setSteps((current) => current.map((step, i) => (i === index ? value : step)));
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, i) => i !== index));
  };

  const reset = () => {
    setTemplateName("");
    setCode("");
    setDescription("");
    setSteps([""]);
    setError(null);
  };

  const handleSubmit = () => {
    const cleanSteps = steps.map((step) => step.trim()).filter(Boolean);

    if (!templateName.trim()) {
      setError("El nombre de la plantilla es obligatorio.");
      return;
    }
    if (cleanSteps.length === 0) {
      setError("Agregá al menos un paso.");
      return;
    }

    onSubmit({
      templateName: templateName.trim(),
      detail: cleanSteps.join("\n"),
      code: code.trim() || undefined,
      description: description.trim() || undefined,
    });
    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Nueva plantilla de checklist</h2>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="templateName" className="text-xs font-medium text-slate-500">
              Nombre Plantilla *
            </label>
            <input
              id="templateName"
              type="text"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="code" className="text-xs font-medium text-slate-500">
              Código
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="description" className="text-xs font-medium text-slate-500">
              Descripción
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={FIELD_CLASSES}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Detalle (pasos)</p>
            {steps.map((step, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={step}
                  placeholder={`Paso ${index + 1}`}
                  onChange={(event) => updateStep(index, event.target.value)}
                  className={FIELD_CLASSES}
                />
                {steps.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStep(index)}
                    aria-label="Quitar paso"
                    className="shrink-0 text-slate-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSteps((current) => [...current, ""])}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar paso
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-medium text-red-500">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
};
