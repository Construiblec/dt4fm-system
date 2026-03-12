type TaskPriority = "ALTA" | "MEDIA" | "BAJA";

type TaskCardProps = {
  id: string;
  priority: TaskPriority;
  time: string;
  description: string;
  status: string;
};

const priorityStyles: Record<TaskPriority, string> = {
  ALTA: "border-red-500",
  MEDIA: "border-yellow-500",
  BAJA: "border-blue-500",
};

export const TaskCard = ({
  id,
  priority,
  time,
  description,
  status,
}: TaskCardProps) => {
  return (
    <article
      className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${priorityStyles[priority]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tracking-wide text-slate-700">
              {priority}
            </span>
            <span className="text-sm font-semibold text-slate-500">{id}</span>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{time}</p>
            <h3 className="text-base font-semibold text-slate-900">
              {description}
            </h3>
          </div>
        </div>

        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {status}
        </button>
      </div>
    </article>
  );
};
