import { isoAt, ymdOf } from "./dates";

/**
 * Pausas fijas del equipo de operarios, en hora de Guayaquil y todos los días.
 * Solo avisan: una limpieza urgente puede cruzarlas si hace falta.
 */
export const BREAKS = [
  { label: "Lunch", start: "10:00", end: "10:15" },
  { label: "Almuerzo", start: "13:00", end: "13:45" },
] as const;

export type Break = (typeof BREAKS)[number];

/** Pausas que pisa un horario. Terminar justo cuando empieza una no cuenta. */
export const breaksCrossed = (
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): Break[] => {
  const day = ymdOf(startIso);
  if (!day || !endIso) return [];
  const start = Date.parse(startIso as string);
  const end = Date.parse(endIso);

  return BREAKS.filter(
    (b) =>
      start < Date.parse(isoAt(day, b.end)) &&
      Date.parse(isoAt(day, b.start)) < end,
  );
};

/** «El horario cruza el almuerzo (13:00–13:45).», o null si no cruza ninguna. */
export const breakWarning = (crossed: readonly Break[]): string | null =>
  crossed.length
    ? `El horario cruza ${crossed
        .map((b) => `el ${b.label.toLowerCase()} (${b.start}–${b.end})`)
        .join(" y ")}.`
    : null;
