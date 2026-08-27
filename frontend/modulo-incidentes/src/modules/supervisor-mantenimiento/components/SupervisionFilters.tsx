import { Eraser } from "lucide-react";
import { useState } from "react";
import {
  CORRECTIVE_FILTERABLE_STATUSES,
  CORRECTIVE_STATUS_LABELS,
} from "@/modules/incidentes/constants/correctiveStatus";
import { PREVENTIVE_STATUS_LABELS } from "@/modules/incidentes/constants/preventiveStatus";
import type { MaintenanceKind } from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { DateField } from "@/shared/components/DateField";

type Props = {
  kind: MaintenanceKind;
  status: string;
  onStatusChange: (value: string) => void;
  /** Rango aplicado, en `YYYY-MM-DD`; solo lo usa el preventivo. */
  from: string;
  to: string;
  onDateRangeApply: (from: string, to: string) => void;
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

const inputLabel =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

/**
 * A diferencia de `PreventiveFilters` —que solo ofrece los tres estados
 * activos del técnico— el supervisor ve el flujo completo: los 9 estados del
 * correctivo y los 6 del preventivo.
 *
 * El rango de fechas es **solo para preventivos**: filtra por inicio previsto,
 * que es la fecha con la que se planifica la carga de trabajo. Un correctivo
 * nace de una incidencia y no se programa, así que ahí no tendría sentido.
 */
export const SupervisionFilters = ({
  kind,
  status,
  onStatusChange,
  from,
  to,
  onDateRangeApply,
  onClear,
}: Props) => {
  const isPreventive = kind === "preventive";

  // Borrador local: las fechas se envían al pulsar «Filtrar», no al teclear.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  /**
   * Si el rango cambia desde fuera —«Limpiar filtros», o cambiar de tipo— el
   * borrador tiene que seguirlo. Se ajusta **durante el render** y no en un
   * efecto: es el patrón que recomienda React para reaccionar a un cambio de
   * props, y evita el render en cascada que provoca un `setState` en efecto.
   */
  const [aplicado, setAplicado] = useState({ from, to });

  if (aplicado.from !== from || aplicado.to !== to) {
    setAplicado({ from, to });
    setDraftFrom(from);
    setDraftTo(to);
  }

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

  const rangoInvertido =
    Boolean(draftFrom) && Boolean(draftTo) && draftFrom > draftTo;

  const sinCambios = draftFrom === from && draftTo === to;

  return (
    <div className="w-full space-y-3 rounded-2xl bg-white p-3 shadow-sm">
      {isPreventive ? (
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="filtroDesde" className={inputLabel}>
                Fecha inicio
              </label>
              <DateField
                id="filtroDesde"
                value={draftFrom}
                onChange={setDraftFrom}
              />
            </div>
            <div>
              <label htmlFor="filtroHasta" className={inputLabel}>
                Fecha fin
              </label>
              <DateField
                id="filtroHasta"
                value={draftTo}
                onChange={setDraftTo}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => onDateRangeApply(draftFrom, draftTo)}
            disabled={rangoInvertido || sinCambios}
            className="mt-2 w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Filtrar
          </button>

          {rangoInvertido ? (
            <p className="mt-1.5 text-xs font-medium text-amber-700">
              La fecha de inicio es posterior a la de fin.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">
              Filtra por inicio previsto; ambos días quedan incluidos. Deja uno
              vacío para dejar ese extremo abierto.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex w-full items-center gap-2">
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
    </div>
  );
};
