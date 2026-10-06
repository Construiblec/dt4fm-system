import { useState } from "react";
import type { AccessLevel } from "@/modules/supervisor-cav/types/Authorization";

type Props = {
  current: AccessLevel;
  onConfirm: (level: AccessLevel) => Promise<void>;
  onClose: () => void;
};

/**
 * Dos casillas, no un selector de tres valores: es más fácil marcar "también
 * vehicular" que entender que `both` es una tercera opción aparte de las
 * otras dos. El valor final se deriva de la combinación marcada.
 */
const deriveLevel = (
  pedestrian: boolean,
  vehicular: boolean,
): AccessLevel | null => {
  if (pedestrian && vehicular) return "both";
  if (vehicular) return "vehicular";
  if (pedestrian) return "pedestrian";
  return null;
};

const checkboxRow =
  "flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition has-[:checked]:border-brand has-[:checked]:bg-brand/5";

export const AccessLevelModal = ({ current, onConfirm, onClose }: Props) => {
  const [pedestrian, setPedestrian] = useState(
    current === "pedestrian" || current === "both",
  );
  const [vehicular, setVehicular] = useState(
    current === "vehicular" || current === "both",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = deriveLevel(pedestrian, vehicular);

  const handleConfirm = async () => {
    if (!level) return;

    try {
      setSaving(true);
      setError(null);
      await onConfirm(level);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cambiar el nivel de acceso",
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            Cambiar nivel de accesos
          </h2>
          <p className="text-sm text-slate-500">
            A qué puede entrar este huésped con su PIN.
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <label className={checkboxRow}>
            <input
              type="checkbox"
              checked={pedestrian}
              onChange={(event) => setPedestrian(event.target.checked)}
              className="h-4.5 w-4.5 rounded border-slate-300 text-brand focus:ring-4 focus:ring-brand/20"
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
              className="h-4.5 w-4.5 rounded border-slate-300 text-brand focus:ring-4 focus:ring-brand/20"
            />
            <span className="text-sm font-medium text-slate-800">
              Acceso Vehicular
            </span>
          </label>

          {!level ? (
            <p className="text-xs font-medium text-amber-700">
              Marca al menos un tipo de acceso.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
              {error}
            </p>
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
            onClick={() => void handleConfirm()}
            disabled={saving || !level}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
};
