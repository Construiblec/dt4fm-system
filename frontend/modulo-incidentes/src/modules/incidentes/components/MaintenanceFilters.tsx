import { Filter, Eraser } from "lucide-react";

type Props = {
  priorityFilter: string;
  statusFilter: "ALL" | "Ejecución" | "Otros";
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: "ALL" | "Ejecución" | "Otros") => void;
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
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-100 p-2">
        <Filter className="h-4 w-4 text-slate-600" />
      </div>

      <select
        value={statusFilter}
        onChange={(e) =>
          onStatusChange(e.target.value as "ALL" | "Ejecución" | "Otros")
        }
        className="flex-shrink-0 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
      >
        <option value="ALL">Estado</option>
        <option value="Ejecución">En ejecución</option>
        <option value="Otros">Otros</option>
      </select>

      <select
        value={priorityFilter}
        onChange={(e) => onPriorityChange(e.target.value)}
        className="flex-shrink-0 w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
      >
        <option value="ALL">Prioridad</option>
        <option value="Alto">Alto</option>
        <option value="Medio">Medio</option>
        <option value="Bajo">Bajo</option>
      </select>

      <button
        type="button"
        onClick={onClear}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
        title="Limpiar filtros"
      >
        <Eraser className="h-4 w-4" />
      </button>
    </div>
  );
};
