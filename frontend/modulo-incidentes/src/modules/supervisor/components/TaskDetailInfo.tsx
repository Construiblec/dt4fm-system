import { User, MapPin, Hash } from "lucide-react";
import {
  getCleaningPhaseLabel,
  getCleaningPhasePill,
} from "@/modules/incidentes/constants/cleaningPhase";
import { TaskTimes } from "@/modules/supervisor/components/TaskTimes";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { cleanObservationText } from "@/shared/utils/textUtils";

type Props = {
  detail: CleaningTaskDetail;
};

export const TaskDetailInfo = ({ detail }: Props) => {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
      {/* Phase + taskNumber */}
      <div className="flex items-center justify-between">
        <span className={getCleaningPhasePill(detail.phase)}>
          {getCleaningPhaseLabel(detail.phase)}
        </span>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Hash className="h-3 w-3" />
          {detail.taskNumber}
        </div>
      </div>

      {/* Location */}
      <div className="flex items-start gap-2 text-sm text-slate-700">
        <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        <div>
          <p className="font-semibold">{detail.unit?.description ?? detail.description}</p>
          {detail.unit && (
            <p className="text-xs text-slate-400">{detail.description}</p>
          )}
        </div>
      </div>

      {/* Employee */}
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <User className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span>{formatEmployeeName(detail.employee?.name)}</span>
      </div>

      <TaskTimes
        checkoutDate={detail.checkoutDate}
        plannedStartTime={detail.plannedStartTime}
        actualStartTime={detail.actualStartTime}
        actualEndTime={detail.actualEndTime}
        executionTime={detail.executionTime}
      />

      {/* Task Observations */}
      {!!detail.taskObservations && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="mb-1 text-xs font-semibold text-blue-700">Observaciones de la tarea</p>
          <p className="whitespace-pre-line text-sm text-blue-900 italic">"{cleanObservationText(detail.taskObservations)}"</p>
        </div>
      )}

      {/* Supervision Observations */}
      {!!detail.supervisionObserv && (
        <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
          <p className="mb-1 text-xs font-semibold text-violet-700">Observaciones de supervisión</p>
          <p className="whitespace-pre-line text-sm text-violet-900 italic">"{cleanObservationText(detail.supervisionObserv)}"</p>
        </div>
      )}

      {/* Team Observations */}
      {!!detail.teamObservations && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-700">Observaciones del empleado</p>
          <p className="whitespace-pre-line text-sm text-amber-900 italic">"{cleanObservationText(detail.teamObservations)}"</p>
        </div>
      )}
    </section>
  );
};
