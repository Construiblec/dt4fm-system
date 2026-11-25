export type Range = { from: string; to: string };

const DAY_MS = 24 * 60 * 60 * 1000;
// America/Guayaquil: UTC-5 todo el año.
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DEFAULT_DAYS = 2;

/** Sin extremos: desde hoy 00:00 hasta pasado mañana 00:00, hora local. */
export const resolveCleanersRange = (query: Partial<Range>): Range => {
  const today =
    Math.floor((Date.now() - OFFSET_MS) / DAY_MS) * DAY_MS + OFFSET_MS;

  return {
    from: new Date(query.from ?? today).toISOString(),
    to: new Date(query.to ?? today + DEFAULT_DAYS * DAY_MS).toISOString(),
  };
};
