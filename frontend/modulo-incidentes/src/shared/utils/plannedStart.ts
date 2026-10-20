import { toIsoDate } from "@/shared/utils/dateTimeInput";

/** Hoy en `YYYY-MM-DD`, hora local. */
export const todayIso = (now = new Date()): string =>
  toIsoDate(now.getFullYear(), now.getMonth(), now.getDate());

/** `HH:mm` de ahora, para limitar la hora cuando la fecha es hoy. */
export const nowTime = (now = new Date()): string =>
  `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

/**
 * Qué falta o está mal en un inicio previsto, o `null` si vale. No se admite
 * una fecha pasada ni, si es hoy, una hora que ya pasó.
 */
export const plannedStartProblem = (
  fecha: string,
  hora: string,
  now = new Date(),
): string | null => {
  if (!fecha && !hora) return "Indica la fecha y la hora de inicio previsto.";
  if (!fecha) return "Falta la fecha de inicio previsto.";
  if (!hora) return "Falta la hora de inicio previsto.";

  const today = todayIso(now);
  if (fecha < today) return "La fecha no puede ser anterior a hoy.";
  if (fecha === today && hora < nowTime(now)) {
    return "Esa hora ya pasó; elige una hora posterior.";
  }

  return null;
};
