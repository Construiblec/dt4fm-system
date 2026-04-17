import { CheckCircle2 } from "lucide-react";

type Props = {
  activities: string[];
  templateName?: string;
};

export const TaskDetailChecklist = ({ activities, templateName }: Props) => {
  if (activities.length === 0) return null;

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

      <ul className="space-y-2">
        {activities.map((activity, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
            <span>{activity}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
