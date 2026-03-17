type TaskCardProps = {
  number: string;
  location: string;
  building: string;
  priority: string;
  status: string;
  createdAt: string;
};

const priorityStyles: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-emerald-100 text-emerald-700",
};

export const TaskCard = ({
  number,
  location,
  building,
  priority,
  status,
  createdAt,
}: TaskCardProps) => {
  const statusStyles: Record<string, string> = {
    Execution: "bg-blue-100 text-blue-700",
    Closed: "bg-slate-100 text-slate-700",
    Open: "bg-emerald-100 text-emerald-700",
  };

  return (
    <article className="rounded-xl border-l-4 border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${
                priorityStyles[priority] ?? "bg-slate-100 text-slate-700"
              }`}
            >
              {priority}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              {number}
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{location}</p>
            <h3 className="text-base font-semibold text-slate-900">
              {building}
            </h3>
            <p className="text-sm text-slate-500">
              {new Date(createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <span
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            statusStyles[status] ?? "bg-slate-100 text-slate-700"
          }`}
        >
          {status}
        </span>
      </div>
    </article>
  );
};
