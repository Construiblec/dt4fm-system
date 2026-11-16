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
import { getCurrentRole } from "@/shared/auth/session";
import {
  getSupervisionPhaseLabel,
  getSupervisionPhasePill,
} from "@/modules/supervisor/constants/supervisionStatus";

type Props = {
  task: CleaningTask;
};

/**
 * SupervisorLimpieza (único rol con panel de supervisión) abre la supervisión
 * de la limpieza: la crea si es `Completed` y la muestra si ya existe. Una
 * `Reviewed` sin supervisión (anterior a esta función) no tiene nada que abrir.
 * El resto (SuperUser) abre la ficha de AsistenteSL.
 */
const cardTarget = (task: CleaningTask): { to?: string; label: string } => {
  if (getCurrentRole() !== "SupervisorLimpieza") {
    return { to: `/asistente-sl/tasks/${task.id}`, label: "Ver detalle" };
  }
  if (task.phase === "Completed") {
    return { to: `/supervision/tarea/${task.id}`, label: "Supervisar" };
  }
  return task.supervision
    ? { to: `/supervision/tarea/${task.id}`, label: "Ver supervisión" }
    : { label: "Ver detalle" };
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
  const target = cardTarget(task);

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
      footerStart={
        isReopened ? (
          <ReopenedFlag />
        ) : task.supervision ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getSupervisionPhasePill(task.supervision.phase)}`}
          >
            {getSupervisionPhaseLabel(task.supervision.phase)}
          </span>
        ) : null
      }
      to={target.to}
      actionLabel={target.label}
    />
  );
};
