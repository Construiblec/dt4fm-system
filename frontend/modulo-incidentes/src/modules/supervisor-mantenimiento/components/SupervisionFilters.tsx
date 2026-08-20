import { Eraser } from "lucide-react";
import {
  CORRECTIVE_FILTERABLE_STATUSES,
  CORRECTIVE_STATUS_LABELS,
} from "@/modules/incidentes/constants/correctiveStatus";
import { PREVENTIVE_STATUS_LABELS } from "@/modules/incidentes/constants/preventiveStatus";
import type { MaintenanceKind } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";

type Props = {
  kind: MaintenanceKind;
  status: string;
  onStatusChange: (value: string) => void;
  onClear: () => void;
};

const PREVENTIVE_STATUSES = [
  "Planning",
  "Acceptance",
  "Execution",
  "Suspension",
  "Completed",
  "Canceled",
];

/**
 * A diferencia de `PreventiveFilters` —que solo ofrece los tres estados
 * activos del técnico— el supervisor ve el flujo completo: los 9 estados del
 * correctivo y los 6 del preventivo.
 */
export const SupervisionFilters = ({
  kind,
  status,
  onStatusChange,
  onClear,
}: Props) => {
  const options =
    kind === "corrective"
      ? CORRECTIVE_FILTERABLE_STATUSES.map((value) => ({
          value,
          label: CORRECTIVE_STATUS_LABELS[value],
        }))
      : PREVENTIVE_STATUSES.map((value) => ({
          value,
          label: PREVENTIVE_STATUS_LABELS[value],
        }));

  return (
    <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      >
        <option value="ALL">Estado</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onClear}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
        title="Limpiar filtros"
      >
        <Eraser className="h-4 w-4" />
      </button>
    </div>
  );
};
