import { ChevronLeft, ChevronRight, Filter, Eraser } from "lucide-react";
import { shiftDay } from "@/modules/incidentes/utils/operatorCleaningFilter";

const PHASES = [
  // Sin completadas: esas solo salen al elegir «Completada»
  { value: "ALL", label: "Todas las fases" },
  { value: "Assigned", label: "Asignada" },
  { value: "InExecution", label: "En ejecución" },
  { value: "Completed", label: "Completada" },
];

type Props = {
  phaseFilter: string;
  onPhaseChange: (value: string) => void;
  /** Día que se está viendo, YYYY-MM-DD */
  day: string;
  today: string;
  onDayChange: (day: string) => void;
  onClear: () => void;
};

const ICON_BUTTON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200";

export const CleaningFilters = ({
  phaseFilter,
  onPhaseChange,
  day,
  today,
  onDayChange,
  onClear,
}: Props) => {
  return (
    <div className="w-full space-y-2 rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        {/* Icono */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Filter className="h-4 w-4 text-slate-600" />
        </div>

        {/* Select ocupa todo el espacio disponible */}
        <select
          value={phaseFilter}
          onChange={(e) => onPhaseChange(e.target.value)}
          aria-label="Fase"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        >
          {PHASES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Botón fijo: vuelve a «Todas las fases» y a hoy */}
        <button
          type="button"
          onClick={onClear}
          className={ICON_BUTTON}
          title="Limpiar filtros"
        >
          <Eraser className="h-4 w-4" />
        </button>
      </div>

      {/* Día: por defecto hoy */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onDayChange(shiftDay(day, -1))}
          className={ICON_BUTTON}
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.target.value) onDayChange(e.target.value);
          }}
          aria-label="Día"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
        />

        <button
          type="button"
          onClick={() => onDayChange(shiftDay(day, 1))}
          className={ICON_BUTTON}
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => onDayChange(today)}
          disabled={day === today}
          className="h-10 shrink-0 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-slate-100"
        >
          Hoy
        </button>
      </div>
    </div>
  );
};
