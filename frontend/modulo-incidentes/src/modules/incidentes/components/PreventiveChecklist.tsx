import { CheckCircle2, ClipboardList } from "lucide-react";
import { PreventiveChecklistItemField } from "@/modules/incidentes/components/PreventiveChecklistItemField";
import type { PreventiveChecklistItem } from "@/modules/incidentes/types/PreventiveChecklist";

type Props = {
  items: PreventiveChecklistItem[];
  answers: Record<number, string>;
  onAnswerChange: (taskDefId: number, value: string) => void;
  /** Bloquea la edición mientras se está guardando o si ya está cerrado */
  disabled?: boolean;
};

/**
 * OpenMAINT describe el equipo como `Código - Descripción`, y el código es un
 * identificador autogenerado que no le dice nada al técnico.
 */
const stripLeadingCode = (description: string) => {
  const separator = description.indexOf(" - ");

  return separator === -1
    ? description
    : description.slice(separator + 3).trim();
};

export const PreventiveChecklist = ({
  items,
  answers,
  onAnswerChange,
  disabled = false,
}: Props) => {
  const completedCount = items.filter((item) =>
    Boolean(answers[item.taskDefId]),
  ).length;

  // Si todas las actividades son sobre el mismo equipo, repetirlo en cada una
  // solo añade ruido: ya está en la cabecera del mantenimiento.
  const showEquipment =
    new Set(items.map((item) => item.equipment)).size > 1;

  const progressPercentage =
    items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">
          Checklist de actividades
        </h2>
      </div>

      <p className="mt-1 text-sm text-slate-500">
        {completedCount} de {items.length} actividades resueltas
      </p>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const value = answers[item.taskDefId] ?? "";
          const isResolved = Boolean(value);

          return (
            <div
              key={item.taskDefId}
              className={`rounded-2xl border p-4 transition ${
                isResolved
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label
                  htmlFor={`checklist-item-${item.taskDefId}`}
                  className="text-sm font-medium leading-6 text-slate-800"
                >
                  {item.order}. {item.label}
                </label>

                {isResolved ? (
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                ) : null}
              </div>

              {showEquipment && item.equipment ? (
                <p className="mt-1 text-xs text-slate-500">
                  {stripLeadingCode(item.equipment)}
                </p>
              ) : null}

              <div className="mt-3">
                <fieldset disabled={disabled} className="contents">
                  <PreventiveChecklistItemField
                    item={item}
                    value={value}
                    onChange={(next) => onAnswerChange(item.taskDefId, next)}
                  />
                </fieldset>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
