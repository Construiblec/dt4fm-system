import { useEffect, useMemo, useState } from "react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { formatDuration } from "@/shared/utils/dateUtils";

export const useActiveTaskTimer = () => {
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  // Se cuenta desde que el empleado tocó "Iniciar" en la tarjeta, nada más.
  // Sin respaldo a actualStartTime a propósito: en una tarea reabierta ese campo
  // sigue apuntando al primer inicio histórico y el cronómetro arrancaría con el
  // tiempo transcurrido desde entonces en vez de en cero.
  const startTime = activeTask?.executionStartedAt;
  const plannedStartTime = activeTask?.plannedStartTime;
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
    const plannedStartMs = plannedStartTime
      ? new Date(plannedStartTime).getTime()
      : null;
    const plannedEndMs = plannedEndTime
      ? new Date(plannedEndTime).getTime()
      : null;
    const plannedDurationMs =
      plannedStartMs !== null &&
      plannedEndMs !== null &&
      Number.isFinite(plannedStartMs) &&
      Number.isFinite(plannedEndMs)
        ? Math.max(0, plannedEndMs - plannedStartMs)
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
  }, [startTime, plannedStartTime, plannedEndTime, now]);
};
