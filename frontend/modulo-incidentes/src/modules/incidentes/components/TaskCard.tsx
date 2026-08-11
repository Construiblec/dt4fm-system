import { CalendarDays, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TaskCardProps = {
  id: number;
  number: string;
  location: string;
  building: string;
  priority: string;
  status: string;
  createdAt: string;
};

const priorityStyles: Record<string, { border: string; text: string }> = {
  Alto: {
    border: "border-red-500",
    text: "text-red-600",
  },
  Medio: {
    border: "border-amber-500",
    text: "text-amber-600",
  },
  Bajo: {
    border: "border-emerald-500",
    text: "text-emerald-600",
  },
};

const statusStyles: Record<string, string> = {
  Ejecución: "bg-blue-100 text-blue-700",
  Completado: "bg-emerald-100 text-emerald-700",
  Cancelado: "bg-red-100 text-red-700",
};

export const TaskCard = ({
  id,
  location,
  building,
  priority,
  status,
  createdAt,
}: TaskCardProps) => {
  const navigate = useNavigate();
  const priorityStyle = priorityStyles[priority] ?? {
    border: "border-slate-300",
    text: "text-slate-600",
  };

  const isExecutable = status === "Ejecución";

  const formattedDate = new Date(createdAt);
  const shortDate = formattedDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <article
      className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${priorityStyle.border}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-bold uppercase tracking-wide ${priorityStyle.text}`}
          >
            Prioridad {priority}
          </p>

          <h3 className="mt-1 text-base font-semibold text-slate-900">
            {building}
          </h3>
        </div>

        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {shortDate}
        </span>
      </div>

      {/* Status */}
      <div className="mt-2">
        <span
          className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${
            statusStyles[status] ?? "bg-slate-100 text-slate-700"
          }`}
        >
          {status}
        </span>
      </div>

      {/* Body */}
      <div className="mt-3 space-y-2 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{location}</span>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <span>
            Apertura:{" "}
            {formattedDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex justify-end">
        <button
          disabled={!isExecutable}
          onClick={() => {
            if (isExecutable) {
              navigate(`/incidents/${id}`);
            }
          }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            isExecutable
              ? "bg-brand text-white hover:bg-brand-hover"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          Abrir
        </button>
      </div>
    </article>
  );
};
