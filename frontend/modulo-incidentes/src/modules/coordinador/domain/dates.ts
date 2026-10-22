/**
 * Fechas del coordinador. Ecuador continental no tiene horario de verano:
 * UTC−5 fijo, y todo lo que ve el coordinador es hora de Guayaquil sin importar
 * la zona del navegador.
 */

const OFFSET_MS = 5 * 60 * 60 * 1000;
const OFFSET = "-05:00";

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

/**
 * Si dos ISO son el mismo instante. openMAINT devuelve las horas en UTC (`…Z`)
 * y el formulario las arma con `-05:00`: comparar el texto las daría siempre por
 * distintas.
 */
export const sameInstant = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
};

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
  };
};

/** 30/09/2026 */
export const formatDate = (ymd: string | null | undefined): string => {
  if (!ymd) return "—";
  const p = parts(ymd);
  return `${pad2(p.d)}/${pad2(p.m + 1)}/${p.y}`;
};

// ─── Campo de fecha dd/mm/aaaa ──────────────────────────────────────────────
// El `<input type="date">` nativo muestra la fecha en el formato del idioma del
// navegador (mm/dd/aaaa en uno en inglés). El campo propio escribe y lee
// dd/mm/aaaa y guarda YYYY-MM-DD, como el resto.

/** `2026-10-14` → `14/10/2026`; vacío si no hay fecha. */
export const toDmy = (ymd: string | null | undefined): string =>
  ymd ? formatDate(ymd) : "";

/** Pone las barras mientras se escribe: `1410` → `14/10`, `14102026` → `14/10/2026`. */
export const maskDmy = (text: string): string => {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join("/");
};

/** `14/10/2026` → `2026-10-14`. `null` si está incompleta o el día no existe (31/02). */
export const parseDmy = (text: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const ymd = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${ymd}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) &&
    d.getUTCDate() === Number(dd) &&
    d.getUTCMonth() + 1 === Number(mm)
    ? ymd
    : null;
};

// ─── Campo de hora hh:mm (24 h) ─────────────────────────────────────────────
// El `<input type="time">` nativo usa el reloj del idioma del navegador, y el
// español de Ecuador es de 12 h (a. m./p. m.): sin elegir a. m. o p. m. el
// campo queda vacío. El campo propio escribe y lee siempre 24 h.

/**
 * Pone los dos puntos mientras se escribe: `1430` → `14:30`. Una hora que
 * empieza en 3-9 solo puede tener un dígito, así que lleva el cero delante:
 * `8` → `08`, `830` → `08:30`.
 */
export const maskHm = (text: string): string => {
  let digits = text.replace(/\D/g, "");
  if (/^[3-9]/.test(digits)) digits = `0${digits}`;
  digits = digits.slice(0, 4);
  return digits.length > 2
    ? `${digits.slice(0, 2)}:${digits.slice(2)}`
    : digits;
};

/** `14:30` → `14:30`. `null` si está incompleta o no existe (`24:00`, `14:60`). */
export const parseHm = (text: string): string | null => {
  const hm = text.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hm) ? hm : null;
};

/** "hoy", "mañana", "ayer" o "30/09/2026". */
export const relativeDay = (
  ymd: string | null | undefined,
  today: string,
): string => {
  if (!ymd) return "—";
  const diff = diffDays(today, ymd);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  return formatDate(ymd);
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
