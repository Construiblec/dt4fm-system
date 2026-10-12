/**
 * Fechas del coordinador. Ecuador continental no tiene horario de verano:
 * UTC−5 fijo, y todo lo que ve el coordinador es hora de Guayaquil sin importar
 * la zona del navegador.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;
const OFFSET = "-05:00";

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Fecha de hoy en Guayaquil, YYYY-MM-DD. */
export const todayYmd = (nowMs: number = Date.now()): string =>
  new Date(nowMs - OFFSET_MS).toISOString().slice(0, 10);

export const addDays = (ymd: string, days: number): string => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Días entre dos fechas (to − from). */
export const diffDays = (fromYmd: string, toYmd: string): number =>
  Math.round(
    (Date.parse(`${toYmd}T12:00:00Z`) - Date.parse(`${fromYmd}T12:00:00Z`)) /
      86_400_000,
  );

/** Instante ISO de una fecha y hora de Guayaquil: `2026-10-08` + `10:30`. */
export const isoAt = (ymd: string, hhmm: string): string =>
  `${ymd}T${hhmm}:00${OFFSET}`;

/** Fecha (Guayaquil) de un instante ISO. */
export const ymdOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? null
    : new Date(ms - OFFSET_MS).toISOString().slice(0, 10);
};

/** Hora HH:MM (Guayaquil) de un instante ISO. */
export const hmOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? null
    : new Date(ms - OFFSET_MS).toISOString().slice(11, 16);
};

export const minutesOfDay = (iso: string | null | undefined): number | null => {
  const hm = hmOf(iso);
  if (!hm) return null;
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
};

const parts = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    w: d.getUTCDay(),
  };
};

/** 30/09/2026 */
export const formatDate = (ymd: string | null | undefined): string => {
  if (!ymd) return "—";
  const p = parts(ymd);
  return `${pad2(p.d)}/${pad2(p.m + 1)}/${p.y}`;
};

/** mié 30/09 */
export const formatDayShort = (ymd: string | null | undefined): string => {
  if (!ymd) return "—";
  const p = parts(ymd);
  return `${WEEKDAYS_SHORT[p.w]} ${pad2(p.d)}/${pad2(p.m + 1)}`;
};

/** miércoles 30 de septiembre de 2026 */
export const formatLongDate = (ymd: string): string => {
  const p = parts(ymd);
  return `${WEEKDAYS[p.w]} ${p.d} de ${MONTHS[p.m]} de ${p.y}`;
};

/** "hoy", "mañana", "ayer" o "mié 30/09". */
export const relativeDay = (
  ymd: string | null | undefined,
  today: string,
): string => {
  if (!ymd) return "—";
  const diff = diffDays(today, ymd);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  return formatDayShort(ymd);
};

export const formatTime = (iso: string | null | undefined): string =>
  hmOf(iso) ?? "—";

export const formatRange = (
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string => {
  if (!startIso) return "Sin horario";
  return `${hmOf(startIso)}–${endIso ? hmOf(endIso) : "?"}`;
};

/** 75 → "1 h 15 min". */
export const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes == null) return "—";
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return `${h} h${rest ? ` ${rest} min` : ""}`;
};

/** maria.lopez → Maria Lopez. El nombre de usuario de openMAINT es `nombre.apellido`. */
export const formatPersonName = (name: string | null | undefined): string => {
  if (!name) return "Sin asignar";
  return name
    .split(".")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};
