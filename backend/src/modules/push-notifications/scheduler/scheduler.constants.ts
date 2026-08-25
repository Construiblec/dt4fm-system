/**
 * Zona horaria del negocio. Se lee de `process.env` y no de `ConfigService`
 * porque los decoradores `@Cron` se evalúan al importar el módulo, antes de que
 * Nest instancie nada. El valor por defecto coincide con `CALENDAR_TIMEZONE`.
 */
export const BUSINESS_TIMEZONE =
  process.env.CALENDAR_TIMEZONE || 'America/Guayaquil';

/**
 * Días completos entre hoy y `iso`, contados en el calendario local del negocio
 * (no en UTC). Devuelve `null` si la fecha no es válida.
 */
export const daysUntil = (
  iso: string | null | undefined,
  timeZone = BUSINESS_TIMEZONE,
): number | null => {
  if (!iso) return null;

  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;

  const toLocalMidnight = (date: Date) => {
    // 'en-CA' formatea como YYYY-MM-DD.
    const parts = date.toLocaleDateString('en-CA', { timeZone });
    return Date.UTC(
      Number(parts.slice(0, 4)),
      Number(parts.slice(5, 7)) - 1,
      Number(parts.slice(8, 10)),
    );
  };

  return Math.round(
    (toLocalMidnight(target) - toLocalMidnight(new Date())) / 86_400_000,
  );
};
