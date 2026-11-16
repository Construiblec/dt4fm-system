/**
 * TeamObservations guarda, en un solo texto, las notas del equipo (`Nota N`),
 * la bitácora de pausas y el borrador del campo "Observaciones".
 */

/**
 * Bloque de borrador al final de TeamObservations: `{lo que el empleado llevaba
 * escrito}`. Va anclado al final justo para que el recorte de longitud se coma la
 * bitácora vieja antes que el texto vivo, y para no confundirlo con unas llaves
 * escritas en medio de una observación.
 */
const DRAFT_BLOCK = /\s*\{([\s\S]*)\}\s*$/;

/**
 * Lo que el empleado llevaba escrito en el campo "Observaciones" cuando pausó.
 *
 * Es un borrador, no una observación: se guarda en OpenMAINT para que sobreviva a
 * la pausa (y a que cierre la app), pero nunca se muestra. Por eso viaja aparte y
 * `teamObservations` sale siempre limpio de este bloque.
 */
export const extractDraftObservations = (
  text: string | null | undefined,
): string | null => {
  const draft = DRAFT_BLOCK.exec(text ?? '')?.[1]?.trim();
  return draft ? draft : null;
};

/** El texto visible: la bitácora sin el borrador. */
export const stripDraftObservations = (
  text: string | null | undefined,
): string | null => {
  const stripped = (text ?? '').replace(DRAFT_BLOCK, '').trim();
  return stripped ? stripped : null;
};
