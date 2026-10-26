import { useEffect, useState } from "react";

/** Reloj de minuto; solo corre mientras el atraso puede cambiar. */
export const useMinuteClock = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
};
