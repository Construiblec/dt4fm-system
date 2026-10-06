import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { PendingCleaningTask } from "@/modules/coordinador/types/Coordinador";

type Props = {
  task: PendingCleaningTask;
};

export const PendingTaskCard = ({ task }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-slate-900">{task.taskNumber}</p>
      <p className="mt-0.5 text-sm text-slate-600">
        {task.unit?.description ?? task.description}
        {task.checkoutDate ? ` · checkout ${task.checkoutDate}` : ""}
      </p>

      <div className="mt-3 space-y-1">
        {!task.plannedStartTime ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Sin fecha planificada
          </p>
        ) : null}
        {!task.employee ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Sin empleado asignado
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => navigate(`/coordinador/pendientes/${task.id}`)}
        className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Completar
      </button>
    </div>
  );
};
