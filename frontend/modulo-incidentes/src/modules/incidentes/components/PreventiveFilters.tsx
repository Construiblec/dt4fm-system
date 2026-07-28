import { Eraser } from "lucide-react";

type Props = {
  statusFilter: string;
  onStatusChange: (value: string) => void;
  onClear: () => void;
};

/** Opciones de estado: el valor es el `statusCode` estable del backend. */
const statusOptions = [
  { value: "Planning", label: "Planificación" },
  { value: "Acceptance", label: "Aceptación" },
  { value: "Execution", label: "Ejecución" },
  { value: "Suspension", label: "Suspensión" },
  { value: "Completed", label: "Completado" },
  { value: "Canceled", label: "Cancelado" },
] as const;

export const PreventiveFilters = ({
  statusFilter,
  onStatusChange,
  onClear,
}: Props) => {
  return (
    <div className="flex w-full items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <select
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
        className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
      >
        <option value="ALL">Estado</option>
        {statusOptions.map((option) => (
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
