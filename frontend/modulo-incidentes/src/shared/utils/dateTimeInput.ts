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

  const pad = (value: number) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
};
