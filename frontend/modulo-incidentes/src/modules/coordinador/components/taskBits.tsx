import {
  OVERDUE_STYLE,
  STATUS_LEVELS,
  BADGE_SHAPE,
  PILL_SHAPE,
} from "@/shared/constants/statusPalette";
import type { CoordTask } from "../types/Coordinador";
import { formatDuration } from "../domain/dates";
import {
  isOverdue,
  isReopened,
  overdueMinutes,
  STATUS,
  statusKey,
} from "../domain/tasks";
import { cx } from "./uiUtils";

/**
 * Estado de una limpieza: el estado visible (con "En pausa" y "Por asignar"
 * derivados) más "Reabierta" y "Atrasada" cuando corresponden. Los colores son
 * los de `statusPalette.ts`.
 */
export const StatusBadges = ({
  task,
  pill,
  nowMs,
}: {
  task: CoordTask;
  pill?: boolean;
  nowMs: number;
}) => {
  const status = STATUS[statusKey(task)];
  const shape = pill ? PILL_SHAPE : BADGE_SHAPE;
  const late = overdueMinutes(task, nowMs);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          shape,
          "inline-flex whitespace-nowrap",
          STATUS_LEVELS[status.level].badge,
        )}
      >
        {status.label}
      </span>
      {isReopened(task) ? (
        <span
          className={cx(
            shape,
            "inline-flex whitespace-nowrap bg-rose-100 text-rose-700",
          )}
        >
          Reabierta
        </span>
      ) : null}
      {isOverdue(task, nowMs) ? (
        <span
          className={cx(
            shape,
            "inline-flex whitespace-nowrap",
            OVERDUE_STYLE.badge,
          )}
        >
          Atrasada {formatDuration(late)}
        </span>
      ) : null}
    </span>
  );
};

export const SourceBadge = ({ source }: { source: string | null }) =>
  source === "Manual" ? (
    <span
      className={cx(
        BADGE_SHAPE,
        "inline-flex border border-slate-300 bg-white text-slate-600",
      )}
    >
      Manual
    </span>
  ) : (
    <span
      className={cx(BADGE_SHAPE, "inline-flex bg-slate-100 text-slate-700")}
    >
      Hostaway
    </span>
  );
