import { Filter, Eraser } from "lucide-react";

const PHASES = [
  { value: "ALL", label: "Todas las fases" },
  { value: "Assigned", label: "Asignada" },
  { value: "InExecution", label: "En ejecución" },
  { value: "Completed", label: "Completada" },
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
    <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      {/* Icono */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
        <Filter className="h-4 w-4 text-slate-600" />
      </div>

      {/* Select ocupa todo el espacio disponible */}
      <select
        value={phaseFilter}
        onChange={(e) => onPhaseChange(e.target.value)}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      >
        {PHASES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {/* Botón fijo */}
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
