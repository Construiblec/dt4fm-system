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

// ── Formateo de fechas (DD/MM/YYYY, español) ─────────────────────────────────

const LOCALE = "es-EC";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Formatea una fecha ISO a "DD/MM/YYYY".
 * Devuelve el `fallback` cuando el valor es nulo, vacío o inválido.
 */
export const formatDate = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
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

/**
 * Fecha corta legible: "24 ago 2026" — usando el locale para los nombres de
 * meses en español, con orden día-mes-año.
 */
export const formatShortDate = (
  value: string | null | undefined,
  fallback = "Sin fecha",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/**
 * Fecha corta sin año: "24 ago".
 */
export const formatDayMonth = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
};

/**
 * Día y hora cortos: "24 ago, 09:30".
 */
export const formatDayMonthTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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

/**
 * Fecha con estilo medium de Intl: "24 ago 2026" — idéntico a
 * `dateStyle: "medium"` con locale `es-EC`.
 */
export const formatMediumDate = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString(LOCALE, { dateStyle: "medium" });
};

/**
 * Fecha-hora con estilo medium + short: "24 ago 2026, 09:30".
 */
export const formatMediumDateTime = (
  value: string | null | undefined,
  fallback = "—",
): string => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

/**
 * Antigüedad en lenguaje corriente: "hace 5 min", "ayer", "12 ago".
 *
 * A partir de una semana deja de contar y muestra la fecha: "hace 23 días" no
 * dice nada que "12 ago" no diga mejor.
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
