import { useEffect, useMemo, useState } from "react";
import { useCleaningTaskExecutionStore } from "@/store/cleaningTaskExecutionStore";
import { formatDuration } from "@/shared/utils/dateUtils";

export const useActiveTaskTimer = () => {
  const activeTask = useCleaningTaskExecutionStore((state) => state.activeTask);
  // Cero del cronómetro: el arranque de la ejecución en curso según OpenMAINT, con
  // la marca local como respaldo. Manda el servidor porque es lo único idéntico en
  // todas las ventanas; cuando el cero vivía solo en el navegador, cada carga de
  // página lo reinventaba y el conteo volvía a empezar.
  // Sin respaldo a actualStartTime a propósito: en una tarea reabierta ese campo
  // sigue apuntando al primer inicio histórico.
  const startTime = activeTask?.sessionStartedAt ?? activeTask?.executionStartedAt;
  // Con cuánto arranca, según lo que diga el servidor: al reanudar una pausa
  // continúa desde el tiempo ya guardado, y al reabrir una tarea vuelve a cero
  // aunque ese tiempo se siga sumando al acumulado por debajo.
  const baseMs = Math.max(0, activeTask?.sessionBaseMinutes ?? 0) * 60_000;
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
    const elapsedMs =
      startedAtMs !== null ? baseMs + Math.max(0, now - startedAtMs) : 0;
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
  }, [startTime, baseMs, plannedStartTime, plannedEndTime, now]);
};
