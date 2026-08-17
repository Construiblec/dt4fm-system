import { CheckCircle2 } from "lucide-react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import {
  getCheckableActivitiesCount,
  parseCleaningChecklist,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { useMemo } from "react";

type CleaningTaskChecklistProps = {
  activities: string[];
};

/**
 * `shrink-0` es necesario: sin él el input se comprime dentro del flex cuando
 * el texto es largo, y los cuadros salen de distinto tamaño entre filas.
 */
const CHECKBOX_CLASS =
  "mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500";

const CHECKABLE_ROW_CLASS =
  "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition";

export const CleaningTaskChecklist = ({ activities }: CleaningTaskChecklistProps) => {
  const checklistProgress = useCleaningTaskExecutionStore((state) => state.checklistProgress);
  const updateChecklistItem = useCleaningTaskExecutionStore(
    (state) => state.updateChecklistItem,
  );

  const sections = useMemo(() => parseCleaningChecklist(activities), [activities]);
  const totalCheckable = useMemo(() => getCheckableActivitiesCount(activities), [activities]);

  const completedCount = Array.from({ length: totalCheckable }).reduce<number>(
    (acc, _, index) => acc + (checklistProgress[index] ? 1 : 0),
    0,
  );
  const progressPercentage =
    totalCheckable > 0 ? Math.round((completedCount / totalCheckable) * 100) : 0;

  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Checklist de actividades</h2>
          <p className="mt-1 text-sm text-slate-500">
            {completedCount}/{totalCheckable} actividades completadas
          </p>
        </div>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-600" />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="mt-5 space-y-4">
        {sections.map((section, sectionIndex) => {
          const titleIndex = section.checkableIndex;
          const titleChecked = titleIndex !== null && (checklistProgress[titleIndex] ?? false);

          return (
            <div key={sectionIndex} className="space-y-3">
              {section.title !== null && titleIndex !== null ? (
                <label
                  className={`${CHECKABLE_ROW_CLASS} ${
                    titleChecked
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-cyan-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={titleChecked}
                    onChange={(event) =>
                      updateChecklistItem(titleIndex, event.target.checked)
                    }
                    className={CHECKBOX_CLASS}
                  />
                  <span className="text-lg font-bold leading-6 text-slate-800">
                    {section.title}
                  </span>
                </label>
              ) : null}

              {section.items.length > 0 ? (
                <ul
                  className={
                    section.title !== null
                      ? "space-y-2 pl-4"
                      : "space-y-3"
                  }
                >
                  {section.items.map((item) => {
                    // Sección con título: el elemento es solo descripción.
                    if (item.checkableIndex === null) {
                      return (
                        <li
                          key={item.originalIndex}
                          className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                        >
                          <span
                            aria-hidden
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
                          />
                          <span>{item.text}</span>
                        </li>
                      );
                    }

                    // Plantilla sin títulos: el elemento conserva su check.
                    const itemIndex = item.checkableIndex;
                    const itemChecked = checklistProgress[itemIndex] ?? false;

                    return (
                      <li key={item.originalIndex}>
                        <label
                          className={`${CHECKABLE_ROW_CLASS} ${
                            itemChecked
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-slate-200 bg-slate-50 hover:border-cyan-200"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={itemChecked}
                            onChange={(event) =>
                              updateChecklistItem(itemIndex, event.target.checked)
                            }
                            className={CHECKBOX_CLASS}
                          />
                          <span className="text-sm leading-6 text-slate-700">{item.text}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};
