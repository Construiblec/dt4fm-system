/**
 * Cuándo le toca al asistente recordarle al operario que diga "acabado".
 *
 * El resto del recordatorio es plomería de temporizadores dentro del hook, que
 * este proyecto no puede testear (vitest corre sin jsdom). Esta regla sí es pura
 * y es la que tiene un criterio que se puede equivocar, así que vive aparte y
 * con tests.
 */

/**
 * Cada cuánto insiste después del primer aviso. Fijo, y a propósito más largo
 * que el minuto: el recordatorio no penaliza nada, y uno que agobia termina con
 * el operario apagando el asistente entero.
 */
export const REMINDER_REPEAT_MS = 2 * 60_000;

/**
 * Milisegundos hasta el próximo aviso, o `null` si no hay que avisar nunca.
 *
 * El primero llega al cumplirse los minutos que la plantilla le asigna al
 * bloque; los siguientes, cada `REMINDER_REPEAT_MS`, hasta que el bloque se
 * marque.
 *
 * Un bloque sin minutos NO genera avisos: en una plantilla a medio llenar no hay
 * contra qué comparar, y avisar por un tiempo inventado sería peor que callarse.
 */
export const reminderDelayMs = (
  totalMinutes: number | null,
  timesRemindedSoFar: number,
): number | null => {
  if (
    totalMinutes === null ||
    !Number.isFinite(totalMinutes) ||
    totalMinutes <= 0
  ) {
    return null;
  }

  return timesRemindedSoFar > 0
    ? REMINDER_REPEAT_MS
    : Math.round(totalMinutes * 60_000);
};
