/**
 * «Resuelto por el supervisor» de una novedad (`CleaningFinding`).
 *
 * Todavía no existe el atributo booleano en openMAINT, así que la marca va de
 * forma provisional en `Description` (atributo base que la novedad no usa).
 * Cuando el atributo exista, basta con poner su nombre en
 * `OPENMAINT_FINDING_RESOLVED_ATTRIBUTE`: se escribe el booleano, se limpia la
 * marca provisional y nada más cambia (ni la API ni el frontend).
 *
 * La lectura acepta las dos formas, así que las novedades marcadas antes del
 * cambio siguen contando como resueltas.
 */

export const FINDING_RESOLVED_ATTRIBUTE_ENV =
  'OPENMAINT_FINDING_RESOLVED_ATTRIBUTE';

/** Texto que marca la novedad en `Description` mientras no hay atributo. */
export const FINDING_RESOLVED_DESCRIPTION = 'Resuelto por supervisor';

type FindingLike = { Description?: string | null; [key: string]: unknown };

/** Nombre del atributo booleano, o null para usar la marca provisional. */
export const normalizeResolvedAttribute = (
  raw: string | null | undefined,
): string | null => raw?.trim() || null;

/** Lo que hay que escribir en la tarjeta para guardar la marca. */
export const resolvedFields = (
  resolved: boolean,
  attribute: string | null,
): Record<string, unknown> =>
  attribute
    ? { [attribute]: resolved, Description: null }
    : { Description: resolved ? FINDING_RESOLVED_DESCRIPTION : null };

/** ¿Está resuelta? Por el atributo si existe, o por la marca provisional. */
export const isFindingResolved = (
  card: FindingLike,
  attribute: string | null,
): boolean =>
  (attribute !== null && card[attribute] === true) ||
  card.Description?.trim() === FINDING_RESOLVED_DESCRIPTION;
