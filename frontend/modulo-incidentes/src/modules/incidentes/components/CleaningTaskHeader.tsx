import { ArrowLeft, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getCleaningPhaseLabel,
  getCleaningPhasePill,
} from "@/modules/incidentes/constants/cleaningPhase";
import type { CleaningTaskExecutionDetail } from "@/modules/incidentes/types/CleaningTaskExecution";

type CleaningTaskHeaderProps = {
  task: CleaningTaskExecutionDetail;
};

export const CleaningTaskHeader = ({ task }: CleaningTaskHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-600">
            Tarea de limpieza
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900">{task.taskNumber}</h1>
            <span className={getCleaningPhasePill(task.phase)}>
              {getCleaningPhaseLabel(task.phase)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{task.description}</p>
          <div className="mt-3 flex items-start gap-2 text-sm text-slate-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{task.unit?.description ?? task.description}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
