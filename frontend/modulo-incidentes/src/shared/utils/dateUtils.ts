export const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  if (minutes > 0) {
    return `${minutes}min ${seconds}s`;
  }

  return `${seconds}s`;
};

/** Minutos enteros como «2 h 25 min», «50 min», «1 d 3 h». */
export const formatMinutes = (total: number): string => {
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts = [
    days ? `${days} d` : "",
    hours ? `${hours} h` : "",
    minutes || total === 0 ? `${minutes} min` : "",
  ].filter(Boolean);

  return parts.join(" ");
};

/** Duración entre dos instantes: «2 h 25 min», «50 min», «1 d 3 h». `null` si no hay ambos. */
export const formatElapsed = (
  start: string | null | undefined,
  end: string | null | undefined,
): string | null => {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;

  return formatMinutes(Math.round(ms / 60_000));
};

/** Atraso en unidades gruesas: «35 min», «18 h», «2 d 4 h». */
export const formatLate = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const rest = hours % 24;
  return `${Math.floor(hours / 24)} d${rest ? ` ${rest} h` : ""}`;
};

// ── Formateo de fechas (DD/MM/YYYY, español) ─────────────────────────────────

const LOCALE = "es-EC";

const pad = (n: number) => String(n).padStart(2, "0");

/** Una fecha sin hora: `2026-10-14`. */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Meses y hora a mano: `toLocaleString("es-EC", { dateStyle: "medium" })` da
 * «7 oct 2026» en Chrome pero «7/10/2026» en navegadores Gecko (Firefox, Zen).
 */
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const parseCivil = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const ymd = YMD.exec(value);
  const d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayMonthYear = (d: Date) =>
  `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;

/** «7 oct 2026». Lo usan las vistas de mantenimiento correctivo. */
export const formatDayMonthYear = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  const d = parseCivil(value);
  return d ? dayMonthYear(d) : fallback;
};

/** «7 oct 2026, 2:05 p. m.». Lo usan las vistas de mantenimiento correctivo. */
export const formatDayMonthYearTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  const d = parseCivil(value);
  if (!d) return fallback;
  const h = d.getHours();
  // Espacios de no separación: «p. m.» nunca se parte en dos líneas.
  return `${dayMonthYear(d)}, ${h % 12 || 12}:${pad(d.getMinutes())}\u00a0${h < 12 ? "a.\u00a0m." : "p.\u00a0m."}`;
};

/**
 * Formatea una fecha a "DD/MM/YYYY", el formato de todas las fechas de la app.
 * Devuelve el `fallback` cuando el valor es nulo, vacío o inválido.
 *
 * Una fecha sin hora (`2026-10-14`) se toma como día civil: `new Date()` la
 * leería como medianoche UTC y en Ecuador (UTC−5) mostraría el día anterior.
 */
export const formatDate = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const ymd = YMD.exec(value);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/**
 * Formatea a "DD/MM/YYYY HH:mm".
 */
export const formatDateTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "DD/MM/YYYY". (Antes "24 ago 2026"; todas las fechas se muestran así.) */
export const formatShortDate = (
  value: string | null | undefined,
  fallback = "Sin fecha",
): string => formatDate(value, fallback);

/** "DD/MM/YYYY". (Antes "24 ago", sin año.) */
export const formatDayMonth = (
  value: string | null | undefined,
  fallback = "—",
): string => formatDate(value, fallback);

/** "DD/MM/YYYY HH:mm". (Antes "24 ago, 09:30".) */
export const formatDayMonthTime = (
  value: string | null | undefined,
  fallback = "—",
): string => formatDateTime(value, fallback);

/**
 * Solo la hora: "09:30".
 */
export const formatTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Mes y año: "agosto 2026".
 */
export const formatMonthYear = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(LOCALE, { month: "long", year: "numeric" });
};

/** "DD/MM/YYYY". (Antes "24 ago 2026".) */
export const formatMediumDate = (
  value: string | null | undefined,
  fallback = "—",
): string => formatDate(value, fallback);

/** "DD/MM/YYYY HH:mm". (Antes "24 ago 2026, 09:30".) */
export const formatMediumDateTime = (
  value: string | null | undefined,
  fallback = "—",
): string => formatDateTime(value, fallback);

/**
 * Antigüedad en lenguaje corriente: "hace 5 min", "ayer", "12/08/2026".
 *
 * A partir de una semana deja de contar y muestra la fecha: "hace 23 días" no
 * dice nada que "12/08/2026" no diga mejor.
 */
export const formatRelativeTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const minutes = Math.floor((Date.now() - d.getTime()) / 60000);

  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;

  return formatDayMonth(value, fallback);
};
