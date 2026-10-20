import { Check } from "lucide-react";
import { useState } from "react";
import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import {
  getApiErrorMessage,
  updatePlannedStart,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type { SupervisedMaintenance } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { BottomSheet } from "@/shared/components/BottomSheet";
import { DateField } from "@/shared/components/DateField";
import { toDateTimeLocal } from "@/shared/utils/dateTimeInput";

type Props = {
  maintenance: SupervisedMaintenance;
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

/** Hoja para planificar el inicio de un preventivo. */
export const PlannedStartSheet = ({
  maintenance,
  onClose,
  onSuccess,
}: Props) => {
  const [fecha, setFecha] = useState(() =>
    toDateTimeLocal(maintenance.plannedStart).slice(0, 10),
  );
  const [hora, setHora] = useState(() =>
    toDateTimeLocal(maintenance.plannedStart).slice(11, 16),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una hora vacía no se toma como medianoche: hacen falta las dos
  const falta = !fecha
    ? !hora
      ? "Indica la fecha y la hora previstas."
      : "Falta la fecha."
    : !hora
      ? "Falta la hora."
      : null;

  const handleSubmit = async () => {
    if (falta) return;

    try {
      setSaving(true);
      setError(null);
      const response = await updatePlannedStart(
        maintenance.kind,
        maintenance.id,
        new Date(`${fecha}T${hora}`).toISOString(),
      );
      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la fecha prevista"));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title="Planificar inicio"
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-5 px-5">
        <p className="-mt-1 text-sm text-slate-600">
          {[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div>
          <label
            htmlFor="plannedStartDate"
            className="mb-1.5 block text-sm font-bold text-slate-900"
          >
            Inicio previsto{" "}
            <span className="font-normal text-slate-600">(obligatorio)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <DateField
              id="plannedStartDate"
              value={fecha}
              onChange={setFecha}
            />
            <input
              type="time"
              aria-label="Hora prevista"
              value={hora}
              onChange={(event) => setHora(event.target.value)}
              className={formInputClass}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            Es una referencia para planear la carga de trabajo: no asigna a
            nadie ni cambia el estado.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : falta ? (
          <p
            role="status"
            className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            {falta}
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
            onClick={() => void handleSubmit()}
            disabled={Boolean(falta) || saving}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            <Check className="h-4 w-4" aria-hidden />
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
