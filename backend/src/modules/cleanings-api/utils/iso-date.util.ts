const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const ISO_INSTANT =
  /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-](0\d|1[0-4]):[0-5]\d)$/;

/** El ida y vuelta descarta fechas que JavaScript «corre», como el 31 de febrero. */
export const isRealDay = (value: unknown): boolean => {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;

  const date = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** Milisegundos de un instante ISO 8601 con hora y zona; `null` si no lo es. */
export const parseInstant = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;

  const match = ISO_INSTANT.exec(value);

  if (!match || !isRealDay(match[1])) return null;

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
};
