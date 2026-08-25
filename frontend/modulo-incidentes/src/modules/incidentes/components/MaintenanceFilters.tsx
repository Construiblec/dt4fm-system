import { Eraser } from "lucide-react";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "@/shared/constants/priority";

/**
 * El filtro trabaja con el código estable del estado, no con la etiqueta
 * traducida: `Execution` es el único paso en el que el técnico interviene.
 */
export type MaintenanceStatusFilter = "ALL" | "Execution" | "Otros";

type Props = {
  priorityFilter: string;
  statusFilter: MaintenanceStatusFilter;
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: MaintenanceStatusFilter) => void;
  onClear: () => void;
};

export const MaintenanceFilters = ({
  priorityFilter,
  statusFilter,
  onPriorityChange,
  onStatusChange,
  onClear,
}: Props) => {
  return (
    <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <select
        value={statusFilter}
        onChange={(e) =>
          onStatusChange(e.target.value as MaintenanceStatusFilter)
        }
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      >
        <option value="ALL">Estado</option>
        <option value="Execution">En ejecución</option>
        <option value="Otros">Otros</option>
      </select>

      <select
        value={priorityFilter}
        onChange={(e) => onPriorityChange(e.target.value)}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      >
        <option value="ALL">Prioridad</option>
        {PRIORITY_ORDER.map((code) => (
          <option key={code} value={PRIORITY_LABELS[code]}>
            {PRIORITY_LABELS[code]}
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
