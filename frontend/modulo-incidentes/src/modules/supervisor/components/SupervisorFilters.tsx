import { Filter, Eraser } from "lucide-react";

const PHASES = [
  { value: "", label: "Todas las fases" },
  { value: "Completed", label: "Completada" },
  { value: "Reviewed", label: "Revisada" },
];

type Props = {
  phase: string;
  date: string;
  onPhaseChange: (phase: string) => void;
  onDateChange: (date: string) => void;
  onClear: () => void;
};

export const SupervisorFilters = ({
  phase,
  date,
  onPhaseChange,
  onDateChange,
  onClear,
}: Props) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="flex-shrink-0 flex items-center justify-center rounded-lg bg-slate-100 p-2">
        <Filter className="h-4 w-4 text-slate-600" />
      </div>

      <select
        value={phase}
        onChange={(e) => onPhaseChange(e.target.value)}
        className="flex-shrink-0 w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
      >
        {PHASES.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
      />

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
