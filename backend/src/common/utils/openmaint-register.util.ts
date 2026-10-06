const NOTES_BLOCK_REGEX =
  /<span[^>]*data-block="notes"[^>]*>([\s\S]*?)<\/span>/g;

/**
 * Notas de la bitácora (`Register`) de un proceso de OpenMAINT, de la más
 * antigua a la más reciente.
 *
 * OpenMAINT devuelve la bitácora como un bloque de HTML donde cada paso del
 * flujo aparece en un `<span data-block="notes">`, en orden cronológico. Se
 * devuelven ya sin etiquetas ni espacios redundantes; un paso sin nota queda
 * como cadena vacía, para no descolocar las posiciones.
 */
const readNotes = (register: string | null): string[] =>
  register
    ? [...register.matchAll(NOTES_BLOCK_REGEX)].map((match) =>
        match[1]
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
    : [];

/** La nota más reciente: la del último paso del flujo. */
export function extractRegisterNotes(register: string | null): string | null {
  const notes = readNotes(register);
  return notes[notes.length - 1] || null;
}

/**
 * La nota del primer paso: lo que escribió quien reportó la novedad
 * (`ProcessNotes` al abrir el correctivo). En cuanto otro paso añade su nota,
 * la más reciente deja de serlo, así que esta se lee aparte.
 */
export function extractReportNotes(register: string | null): string | null {
  return readNotes(register)[0] || null;
}
