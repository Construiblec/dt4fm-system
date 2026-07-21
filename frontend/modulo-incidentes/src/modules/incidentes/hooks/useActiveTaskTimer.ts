import { useEffect, useMemo, useState } from "react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { formatDuration } from "@/shared/utils/dateUtils";

export const useActiveTaskTimer = () => {
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const startTime = activeTask?.actualStartTime;
  const plannedEndTime = activeTask?.plannedEndTime;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startTime) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [startTime]);

  return useMemo(() => {
    const startedAtMs = startTime ? new Date(startTime).getTime() : null;
    const elapsedMs = startedAtMs !== null ? Math.max(0, now - startedAtMs) : 0;
    const plannedEndMs = plannedEndTime
      ? new Date(plannedEndTime).getTime()
      : null;
    const plannedDurationMs =
      plannedEndMs !== null && startedAtMs !== null
        ? Math.max(0, plannedEndMs - startedAtMs)
        : null;
    const remainingMs =
      plannedDurationMs !== null ? Math.max(0, plannedDurationMs - elapsedMs) : null;
    const isOvertime = plannedDurationMs !== null && elapsedMs > plannedDurationMs;
    const overtimeMs =
      isOvertime && plannedDurationMs !== null ? elapsedMs - plannedDurationMs : 0;

    return {
      elapsedMs,
      elapsedFormatted: formatDuration(elapsedMs),
      plannedDurationMs,
      plannedDurationFormatted:
        plannedDurationMs !== null ? formatDuration(plannedDurationMs) : null,
      remainingMs,
      remainingFormatted: remainingMs !== null ? formatDuration(remainingMs) : null,
      isOvertime,
      overtimeMs,
      overtimeFormatted: overtimeMs > 0 ? formatDuration(overtimeMs) : null,
    };
  }, [startTime, plannedEndTime, now]);
};
