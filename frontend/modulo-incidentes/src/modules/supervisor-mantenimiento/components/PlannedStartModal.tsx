import { Info } from "lucide-react";
import { useState } from "react";
import {
  getApiErrorMessage,
  updatePlannedStart,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type { SupervisedMaintenance } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { toDateTimeLocal } from "@/shared/utils/dateTimeInput";

type Props = {
  maintenance: SupervisedMaintenance;
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

export const PlannedStartModal = ({
  maintenance,
  onClose,
  onSuccess,
}: Props) => {
  const [value, setValue] = useState(toDateTimeLocal(maintenance.plannedStart));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCorrective = maintenance.kind === "corrective";

  const handleSubmit = async () => {
    if (!value) return;

    try {
      setSaving(true);
      setError(null);

      const response = await updatePlannedStart(
        maintenance.kind,
        maintenance.id,
        new Date(value).toISOString(),
      );

      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la fecha prevista"));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            {maintenance.plannedStart
              ? "Editar inicio previsto"
              : "Planificar inicio de ejecución"}
          </h2>
          <p className="text-sm text-slate-500">{maintenance.number ?? ""}</p>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fecha y hora prevista
            </label>
            <input
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Es una referencia para planear la carga de trabajo: no asigna a
              nadie ni cambia el estado.
            </p>
          </div>

          {isCorrective ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <Info className="h-4 w-4 shrink-0" />
              <p>
                Conviene fijarla <strong>antes de asignar</strong>: al asignar,
                el correctivo pasa a Ejecución y openMAINT ya no permite
                cambiar este campo.
              </p>
            </div>
          ) : null}

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
            onClick={handleSubmit}
            disabled={!value || saving}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white ${
              value && !saving
                ? "bg-brand hover:bg-brand-hover"
                : "cursor-not-allowed bg-slate-300"
            }`}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
};
