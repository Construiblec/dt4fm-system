/**
 * Lo que dice el asistente, y desde dónde retoma la conversación cuando el
 * operario lo apaga y lo vuelve a encender.
 *
 * Vive fuera del hook por lo mismo que `voiceCommands` y `voiceReminder`: el
 * hook no se puede testear (vitest corre sin jsdom), y estas son las decisiones
 * de la conversación que se pueden equivocar.
 */

/**
 * Con qué granularidad se trabaja el bloque en curso. Lo fija la respuesta a la
 * pregunta del bloque y se reinicia en cada bloque.
 */
export type BlockMode = "bloque" | "actividad";

/**
 * La fórmula para dar algo por hecho. Se dice UNA vez por bloque, al empezarlo.
 * Repetirla después de cada actividad sobraba: mientras el asistente espera el
 * "acabado", la pantalla la deja a la vista.
 */
export const COMMAND_HINT = "Di: asistente, acabado cuando finalices.";

/** La pregunta con que abre cada bloque. La respuesta fija la granularidad. */
export const blockQuestion = (title: string | null): string =>
  `${title ?? "Esta sección"}. ¿Recuerdas las tareas?`;

/**
 * El anuncio de una actividad. Solo lleva la fórmula la que abre el bloque, la
 * primera que se lee después de contestar que no.
 */
export const activityAnnouncement = (
  text: string,
  blockStart: boolean,
): string => (blockStart ? `${text}. ${COMMAND_HINT}` : `${text}.`);

/**
 * El aviso cuando se cumplen los minutos. Nombra lo pendiente, para que quien
 * se distrajo se reoriente sin mirar el teléfono. La fórmula ya no va: se dijo
 * al empezar el bloque y sigue en pantalla.
 */
export const reminderPhrase = (subject: string): string =>
  `¿Acabaste? ${subject}.`;

/** Al volver a encender en modo bloque: retoma sin volver a preguntar. */
export const resumeBlockPhrase = (title: string | null): string =>
  `Seguimos con ${title ?? "este bloque"}.`;

/** Dónde iba la conversación cuando se apagó el asistente. */
export type PausedAt = { sectionIndex: number; mode: BlockMode };

/**
 * Con qué modo se retoma al volver a encender, o `null` si hay que preguntar.
 *
 * Volver a preguntar era el bug: con "no" releía el bloque desde la primera
 * actividad sin marcar, y si se trabajaba el bloque entero no había ninguna
 * marcada todavía, así que empezaba de cero.
 *
 * Solo se retoma en el mismo bloque. Si mientras estaba apagado el operario
 * marcó el bloque con el dedo, lo pendiente ya es otro y se pregunta como
 * siempre.
 */
export const resumeMode = (
  pausedAt: PausedAt | null,
  sectionIndex: number,
): BlockMode | null =>
  pausedAt !== null && sectionIndex >= 0 && pausedAt.sectionIndex === sectionIndex
    ? pausedAt.mode
    : null;
