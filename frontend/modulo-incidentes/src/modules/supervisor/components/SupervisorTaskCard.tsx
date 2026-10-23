import { ReopenedFlag } from "@/modules/incidentes/components/ReopenedFlag";
import {
  getCleaningPhaseBar,
  getCleaningPhaseLabel,
  getCleaningPhasePill,
} from "@/modules/incidentes/constants/cleaningPhase";
import type { CleaningTask } from "@/modules/incidentes/types/CleaningTask";
import {
  ACTIVE_CLEANING_PHASES,
  cleaningFields,
  cleaningNoticeText,
  getCleaningLateness,
  isCleaningReopened,
} from "@/modules/incidentes/utils/cleaningCard";
import { WorkCard } from "@/shared/components/WorkCard";
import { LATE_START_STYLE } from "@/shared/constants/statusPalette";
import { useMinuteClock } from "@/shared/hooks/useMinuteClock";

type Props = {
  task: CleaningTask;
  onReview?: (task: CleaningTask) => void;
};

export const SupervisorTaskCard = ({ task }: Props) => {
  const isReopened = isCleaningReopened(task);
  const mayBeLate =
    ACTIVE_CLEANING_PHASES.has(task.phase) &&
    !task.actualStartTime &&
    !task.isPaused &&
    !isReopened;
  const now = useMinuteClock(mayBeLate);
  const lateness = getCleaningLateness(task, now);

  return (
    <WorkCard
      number={task.taskNumber || "Limpieza"}
      statusLabel={getCleaningPhaseLabel(task.phase)}
      statusPill={getCleaningPhasePill(task.phase)}
      bar={lateness ? LATE_START_STYLE.bar : getCleaningPhaseBar(task.phase)}
      title={task.description?.trim() || "Sin descripción"}
      notice={
        lateness
          ? { tone: "late", text: cleaningNoticeText(lateness, "supervisor") }
          : null
      }
      fields={cleaningFields(task, "supervisor")}
      footerStart={isReopened ? <ReopenedFlag /> : null}
      to={`/supervisor/tasks/${task.id}`}
      actionLabel={task.phase === "Completed" ? "Revisar" : "Ver detalle"}
    />
  );
};
