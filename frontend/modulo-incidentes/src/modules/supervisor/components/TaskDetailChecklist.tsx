import { CheckCircle2 } from "lucide-react";
import { parseCleaningChecklist } from "@/modules/incidentes/utils/cleaningChecklistUtils";

type Props = {
  activities: string[];
  templateName?: string;
};

export const TaskDetailChecklist = ({ activities, templateName }: Props) => {
  if (activities.length === 0) return null;

  const sections = parseCleaningChecklist(activities);

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Checklist de limpieza</h3>
        {templateName && (
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {templateName}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-2">
            {section.title && (
              <h4 className="flex items-start gap-2 text-lg font-bold text-slate-800">
                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{section.title}</span>
              </h4>
            )}
            <ul className={section.title ? "space-y-2 pl-6" : "space-y-2"}>
              {section.items.map((item) => (
                <li key={item.originalIndex} className="flex items-start gap-2 text-sm text-slate-600">
                  {section.title ? (
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300"
                    />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  )}
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
};
