const NOTES_BLOCK_REGEX =
  /<span[^>]*data-block="notes"[^>]*>([\s\S]*?)<\/span>/g;

/**
 * Extrae la última nota de la bitácora (`Register`) de un proceso de OpenMAINT.
 *
 * OpenMAINT devuelve la bitácora como un bloque de HTML donde cada paso del
 * flujo aparece en un `<span data-block="notes">`. Se devuelve la nota más
 * reciente ya sin etiquetas ni espacios redundantes.
 */
export function extractRegisterNotes(register: string | null): string | null {
  if (!register) {
    return null;
  }

  const matches = [...register.matchAll(NOTES_BLOCK_REGEX)];

  if (!matches.length) {
    return null;
  }

  const notes = matches.map((match) =>
    match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  return notes[notes.length - 1] || null;
}
