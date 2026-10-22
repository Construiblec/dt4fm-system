import { useEffect, useState } from "react";

/**
 * La hora actual, que se refresca sola cada minuto: lo "atrasado", la línea
 * "ahora" de la agenda y el día de hoy se mantienen al día sin recargar.
 */
export const useNow = (everyMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);

  return now;
};
