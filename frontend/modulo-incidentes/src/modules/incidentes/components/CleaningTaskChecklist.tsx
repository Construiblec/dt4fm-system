import { CheckCircle2 } from "lucide-react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { parseCleaningChecklist, getCheckableActivitiesCount } from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { useMemo } from "react";

type CleaningTaskChecklistProps = {
  activities: string[];
};

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
        <CheckCircle2 className="h-5 w-5 text-cyan-600" />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="mt-5 space-y-4">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-3">
            {section.title && (
              <h3 className="text-2xl font-bold text-slate-800">{section.title}</h3>
            )}
            {section.items.map((item) => {
              const checked = checklistProgress[item.checkableIndex] ?? false;

              return (
                <label
                  key={item.originalIndex}
                  className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                    checked
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50 hover:border-cyan-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => updateChecklistItem(item.checkableIndex, event.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                  />
                  <span className="text-sm leading-6 text-slate-700">{item.text}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
};
