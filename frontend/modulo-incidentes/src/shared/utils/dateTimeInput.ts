/**
 * Conversiones entre la fecha local que manejan los formularios y el ISO con
 * zona que guarda openMAINT.
 *
 * La fecha «de trabajo» aquí es siempre **`YYYY-MM-DD`**: ordena bien como
 * texto y no depende de ninguna configuración regional. El `dd/mm/aaaa` es solo
 * presentación, y por eso las dos conversiones viven juntas.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * `<input type="datetime-local">` trabaja en hora local y sin zona
 * («2026-08-25T09:00»), mientras que openMAINT guarda y devuelve ISO con zona.
 * Este helper hace la conversión de entrada; para la de salida basta con
 * `new Date(valor).toISOString()`.
 */
export const toDateTimeLocal = (iso: string | null | undefined): string => {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};

/** `(2026, 7, 25)` → `2026-08-25`. El mes entra en base 0, como en `Date`. */
export const toIsoDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/** `2026-08-25` → `25/08/2026`. Cadena vacía si no es una fecha completa. */
export const isoToDisplay = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

/**
 * `25/08/2026` → `2026-08-25`, y `""` si está incompleta o no existe.
 *
 * La comprobación de existencia importa: `new Date(2026, 1, 31)` no falla, se
 * desborda al 3 de marzo. Comparar los componentes descarta el 31/02 en vez de
 * guardar una fecha que el usuario no escribió.
 */
export const displayToIso = (text: string): string => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return "";

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  const date = new Date(year, month - 1, day);
  const existe =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return existe ? toIsoDate(year, month - 1, day) : "";
};

/** Deja solo dígitos y coloca las barras al teclear `dd/mm/aaaa`. */
export const maskDate = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/**
 * Índice del primer día del mes en una semana que empieza en **lunes**.
 * `getDay()` cuenta desde el domingo, así que hay que rotarlo.
 */
export const mondayOffset = (year: number, month: number) =>
  (new Date(year, month, 1).getDay() + 6) % 7;

/** Cuántos días tiene el mes (base 0, como en `Date`). */
export const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate();

/**
 * Los dos extremos de un día, como instantes ISO con zona.
 *
 * Se calculan en la **hora local del navegador** a propósito: el usuario elige
 * «18/06» pensando en su día, no en el día UTC. Construirlos en UTC movería el
 * corte cinco horas en Ecuador y dejaría fuera los mantenimientos de última
 * hora de la tarde.
 *
 * Devuelven `undefined` con la fecha vacía, para poder pasarlos tal cual a un
 * filtro opcional.
 */
export const startOfDayIso = (date: string): string | undefined =>
  date ? new Date(`${date}T00:00:00`).toISOString() : undefined;

export const endOfDayIso = (date: string): string | undefined =>
  date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined;
