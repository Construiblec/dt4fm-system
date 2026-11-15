/**
 * Supervisión posterior de limpieza: una tarjeta `CleaningSupervision` por
 * revisión y una `CleaningFinding` por novedad. Solo se guarda lo que está mal;
 * los puntos conformes no dejan rastro (decisión del 13/11/2026).
 *
 * Nombres verificados contra openMAINT el 14/11/2026.
 */

export const SUPERVISION_CLASS = 'CleaningSupervision';
export const FINDING_CLASS = 'CleaningFinding';

/** Lookup de `CleaningSupervision.Phase`. La API recibe el Id, no el código. */
export const SUPERVISION_PHASE_LOOKUP = 'CleaningSupervisionStatus';

export const SUPERVISION_PHASES = {
  DRAFT: 'Draft',
  IN_CORRECTION: 'InCorrection',
  FIXED: 'Fixed',
  CONFIRMED: 'Confirmed',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
} as const;

export type SupervisionPhase =
  (typeof SUPERVISION_PHASES)[keyof typeof SUPERVISION_PHASES];

/** Fases en que la supervisión sigue viva: ni aprobada ni anulada. */
export const OPEN_SUPERVISION_PHASES: SupervisionPhase[] = [
  SUPERVISION_PHASES.DRAFT,
  SUPERVISION_PHASES.IN_CORRECTION,
  SUPERVISION_PHASES.FIXED,
  SUPERVISION_PHASES.CONFIRMED,
];

export const isOpenSupervisionPhase = (phase: string | null | undefined) =>
  OPEN_SUPERVISION_PHASES.includes(phase as SupervisionPhase);

/** `Code` de la tarjeta de `CleaningActivity` que guarda el CSV de supervisión. */
export const SUPERVISION_TEMPLATE_CODE = 'SUPERVISION';

/** Puntos del CSV actual (`Book1.csv`). Solo se exige al guardar la plantilla. */
export const SUPERVISION_POINT_COUNT = 19;

export const MAX_FINDING_PHOTOS = 2;
export const MAX_FINDING_OBSERVATION = 500;

/**
 * Único rol con acceso al panel y a las acciones de supervisión. No se usa
 * `SUPERVISOR_ROLES`: incluye AsistenteSL y SuperUser, que quedan fuera.
 */
export const SUPERVISION_PANEL_ROLE = 'SupervisorLimpieza';

export const isSupervisionPanelRole = (role: string | null | undefined) =>
  role === SUPERVISION_PANEL_ROLE;

/** Categoría de mantenimiento cuyas subcategorías son las novedades. */
export const CLEANING_CATEGORY_CODE = 'LIM';

/**
 * Variable de entorno con la fecha de corte (ISO con zona). Las limpiezas que
 * terminaron antes no reciben supervisión y quedan en `Completed`.
 */
export const SUPERVISION_START_DATE_ENV = 'SUPERVISION_START_DATE';

/** Prefijo de las fotos de una novedad; lo pone siempre el backend. */
export const FINDING_PHOTO_PREFIX = 'nov_';

/** Motivos por los que abrir una limpieza no crea su supervisión. */
export type SupervisionUnavailableReason =
  | 'legacy'
  | 'superseded'
  | 'disabled'
  | 'reviewed';
