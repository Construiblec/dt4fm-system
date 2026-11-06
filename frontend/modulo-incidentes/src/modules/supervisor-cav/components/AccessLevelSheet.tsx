import { useState } from "react";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import type {
  AccessLevel,
  AccessLevelChoice,
} from "@/modules/supervisor-cav/types/Authorization";
import { BottomSheet } from "@/shared/components/BottomSheet";

type Props = {
  /** `null` = acceso revocado: la hoja sirve para restaurarlo. */
  current: AccessLevel | null;
  onConfirm: (level: AccessLevelChoice) => Promise<void>;
  onClose: () => void;
};

/** Dos casillas en vez de tres valores: `both` sale de marcar las dos y `none` de ninguna. */
const deriveLevel = (
  pedestrian: boolean,
  vehicular: boolean,
): AccessLevelChoice => {
  if (pedestrian && vehicular) return "both";
  if (vehicular) return "vehicular";
  if (pedestrian) return "pedestrian";
  return "none";
};

const checkboxRow =
  "flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition has-[:checked]:border-brand has-[:checked]:bg-brand/5";

const checkbox =
  "h-4.5 w-4.5 rounded border-slate-300 text-brand focus:ring-4 focus:ring-brand/20";

export const AccessLevelSheet = ({ current, onConfirm, onClose }: Props) => {
  const restoring = current === null;
  const [pedestrian, setPedestrian] = useState(
    current === "pedestrian" || current === "both",
  );
  const [vehicular, setVehicular] = useState(
    current === "vehicular" || current === "both",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = deriveLevel(pedestrian, vehicular);
  const revoking = level === "none" && !restoring;
  const disabled = saving || (level === "none" && restoring);

  const handleConfirm = async () => {
    try {
      setSaving(true);
      setError(null);
      await onConfirm(level);
    } catch (err) {
      setError(
        getApiErrorMessage(err, "No se pudo cambiar el nivel de acceso"),
      );
      setSaving(false);
    }
  };

  const primaryLabel = saving
    ? "Guardando..."
    : restoring
      ? "Restaurar"
      : revoking
        ? "Revocar acceso"
        : "Confirmar";

  return (
    <BottomSheet
      open
      title={restoring ? "Restaurar acceso" : "Cambiar nivel de accesos"}
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-2 px-5">
        <p className="-mt-1 pb-2 text-sm text-slate-500">
          {restoring
            ? "A qué podrá entrar de nuevo, con su mismo PIN."
            : "A qué puede entrar este huésped con su PIN."}
        </p>

        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={pedestrian}
            onChange={(event) => setPedestrian(event.target.checked)}
            className={checkbox}
          />
          <span className="text-sm font-medium text-slate-800">
            Acceso Peatonal
          </span>
        </label>

        <label className={checkboxRow}>
          <input
            type="checkbox"
            checked={vehicular}
            onChange={(event) => setVehicular(event.target.checked)}
            className={checkbox}
          />
          <span className="text-sm font-medium text-slate-800">
            Acceso Vehicular
          </span>
        </label>

        {revoking ? (
          <p className="rounded-xl bg-red-50 p-3 text-xs font-medium leading-relaxed text-red-700">
            El huésped no podrá abrir ninguna puerta. Podrás restaurar el acceso
            después, con el mismo PIN.
          </p>
        ) : null}

        {level === "none" && restoring ? (
          <p className="text-xs font-medium text-amber-700">
            Marca al menos un tipo de acceso.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={disabled}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              revoking
                ? "bg-red-600 hover:bg-red-700"
                : "bg-brand hover:bg-brand-hover"
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
