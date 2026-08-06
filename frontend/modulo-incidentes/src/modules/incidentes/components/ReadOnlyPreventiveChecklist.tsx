import { ClipboardList } from "lucide-react";
import type { PreventiveChecklistItem } from "@/modules/incidentes/types/PreventiveChecklist";
import { formatChecklistOutcome } from "@/modules/incidentes/utils/checklistOutcome";
import { stripLeadingCode } from "@/modules/incidentes/utils/equipmentLabel";

type Props = {
  items: PreventiveChecklistItem[];
};

/**
 * Una actividad resuelta sin valor es una marcada como N.D. al suspender: el
 * backend la da por resuelta precisamente porque se declaró sin dato.
 */
const describeOutcome = (item: PreventiveChecklistItem) => {
  const outcome = formatChecklistOutcome(item);

  if (outcome !== null) {
    return { text: outcome, className: "text-slate-900" };
  }

  return item.isResolved
    ? { text: "N.D.", className: "text-amber-700" }
    : { text: "Sin registrar", className: "text-slate-400" };
};

/**
 * Las actividades tal como quedaron registradas. No reutiliza
 * `PreventiveChecklist` porque aquel se construye alrededor de los campos
 * editables y de `onAnswerChange`.
 */
export const ReadOnlyPreventiveChecklist = ({ items }: Props) => {
  if (items.length === 0) {
    return null;
  }

  const resolvedCount = items.filter((item) => item.isResolved).length;

  // Repetir el equipo en cada actividad solo añade ruido si es siempre el mismo
  const showEquipment = new Set(items.map((item) => item.equipment)).size > 1;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">
          Lista de operación
        </h2>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {resolvedCount} de {items.length} actividades resueltas · solo lectura
      </p>

      <div className="mt-4 space-y-2">
        {items.map((item) => {
          const outcome = describeOutcome(item);

          return (
            <div
              key={item.taskDefId}
              className="rounded-2xl bg-slate-50 px-4 py-3"
            >
              <p className="text-xs text-slate-500">
                {item.order}. {item.label}
              </p>

              {showEquipment && item.equipment ? (
                <p className="mt-0.5 text-xs text-slate-400">
                  {stripLeadingCode(item.equipment)}
                </p>
              ) : null}

              <p className={`mt-1 text-sm font-semibold ${outcome.className}`}>
                {outcome.text}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
