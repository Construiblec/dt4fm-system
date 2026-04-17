import { useEffect, useMemo, useState } from "react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { formatDuration } from "@/shared/utils/dateUtils";

const getElapsedMilliseconds = (startTime?: string) => {
  if (!startTime) {
    return 0;
  }

  return Math.max(0, Date.now() - new Date(startTime).getTime());
};

export const useActiveTaskTimer = () => {
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  const [elapsedMs, setElapsedMs] = useState(() =>
    getElapsedMilliseconds(activeTask?.actualStartTime),
  );

  useEffect(() => {
    if (!activeTask?.actualStartTime) {
      setElapsedMs(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(getElapsedMilliseconds(activeTask.actualStartTime));
    };

    updateElapsed();

    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTask?.actualStartTime]);

  return useMemo(() => {
    const plannedEndMs = activeTask?.plannedEndTime
      ? new Date(activeTask.plannedEndTime).getTime()
      : null;
    const startedAtMs = activeTask?.actualStartTime
      ? new Date(activeTask.actualStartTime).getTime()
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
  }, [activeTask?.actualStartTime, activeTask?.plannedEndTime, elapsedMs]);
};
