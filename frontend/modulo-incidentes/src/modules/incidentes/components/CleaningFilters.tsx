import { Filter, Eraser } from "lucide-react";

const PHASES = [
  { value: "ALL", label: "Fase" },
  { value: "Assigned", label: "Asignada" },
  { value: "InProgress", label: "En progreso" },
  { value: "InExecution", label: "En ejecución" },
  { value: "Completed", label: "Completada" },
  { value: "Reviewed", label: "Revisada" },
  { value: "Cancelled", label: "Cancelada" },
];

type Props = {
  phaseFilter: string;
  onPhaseChange: (value: string) => void;
  onClear: () => void;
};

export const CleaningFilters = ({
  phaseFilter,
  onPhaseChange,
  onClear,
}: Props) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-100 p-2">
        <Filter className="h-4 w-4 text-slate-600" />
      </div>

      <select
        value={phaseFilter}
        onChange={(e) => onPhaseChange(e.target.value)}
        className="flex-shrink-0 w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
      >
        {PHASES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
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
