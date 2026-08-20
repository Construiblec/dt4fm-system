/**
 * Constantes del proceso `CorrectiveMaint`, espejo de
 * `preventive-maintenance/constants/preventive-maint.constants.ts`.
 *
 * Hasta ahora el correctivo vivía de números mágicos incrustados en
 * `incidents.service.ts`; esto los centraliza y le da el mismo contrato de
 * `statusCode` estable que ya tiene el preventivo.
 *
 * Todos los IDs están verificados contra la instancia del 2026-08-20
 * (lookups `Process - ProcessStatus` y `Process - Action`).
 */

export const CORRECTIVE_MAINT_PROCESS = 'CorrectiveMaint';

/** IDs del lookup `Process - ProcessStatus` correspondientes al flujo CM. */
export const CM_STATUS_IDS = {
  OPENING: 277461,
  ASSIGNMENT: 277462,
  MANAGEMENT: 279295,
  ESTIMATE: 279317,
  CONTROL: 388244,
  EXECUTION: 277463,
  ACCOUNTING: 279373,
  COMPLETED: 277464,
  CANCELED: 280086,
} as const;

export type CmStatusId = (typeof CM_STATUS_IDS)[keyof typeof CM_STATUS_IDS];

/**
 * Nombre estable de cada estado, expuesto por la API pública. No se usa la
 * descripción de OpenMAINT porque viene traducida según el idioma de la sesión.
 */
export const CM_STATUS_NAMES: Record<CmStatusId, string> = {
  [CM_STATUS_IDS.OPENING]: 'Opening',
  [CM_STATUS_IDS.ASSIGNMENT]: 'Assignment',
  [CM_STATUS_IDS.MANAGEMENT]: 'Management',
  [CM_STATUS_IDS.ESTIMATE]: 'Estimate',
  [CM_STATUS_IDS.CONTROL]: 'Control',
  [CM_STATUS_IDS.EXECUTION]: 'Execution',
  [CM_STATUS_IDS.ACCOUNTING]: 'Accounting',
  [CM_STATUS_IDS.COMPLETED]: 'Completed',
  [CM_STATUS_IDS.CANCELED]: 'Canceled',
};

/** Mapeo inverso: nombre estable → ID del lookup (para filtrar en OpenMAINT). */
export const CM_STATUS_NAME_TO_ID: Record<string, CmStatusId> = {
  Opening: CM_STATUS_IDS.OPENING,
  Assignment: CM_STATUS_IDS.ASSIGNMENT,
  Management: CM_STATUS_IDS.MANAGEMENT,
  Estimate: CM_STATUS_IDS.ESTIMATE,
  Control: CM_STATUS_IDS.CONTROL,
  Execution: CM_STATUS_IDS.EXECUTION,
  Accounting: CM_STATUS_IDS.ACCOUNTING,
  Completed: CM_STATUS_IDS.COMPLETED,
  Canceled: CM_STATUS_IDS.CANCELED,
};

/** Códigos tal como los devuelve `_ProcessStatus_code` → nombre estable. */
export const CM_STATUS_CODE_TO_NAME: Record<string, string> = {
  'CM-Opening': 'Opening',
  'CM-Assignment': 'Assignment',
  'CM-Management': 'Management',
  'CM-Estimate': 'Estimate',
  'CM-Control': 'Control',
  'CM-Execution': 'Execution',
  'CM-Accounting': 'Accounting',
  'CM-Completed': 'Completed',
  'CM-Canceled': 'Canceled',
};

/** Valores aceptados por el filtro `status` de la API. */
export const VALID_CM_STATUSES = Object.values(CM_STATUS_NAMES);

/**
 * Estado sintético que **no existe en OpenMAINT**: el correctivo ya está en
 * `CM-Execution` porque asignar avanza CM02 directamente, pero el técnico
 * todavía no ha arrancado. Se deriva en el mapeo, nunca se envía a OpenMAINT.
 *
 * Ver el mecanismo completo en `backend/docs/maintenance-supervision/`.
 */
export const CM_DERIVED_ASSIGNED = 'Assigned';

/**
 * IDs del lookup `Process - Action`. Ojo: hay que mandar el ID numérico, no el
 * código — con el código OpenMAINT guarda `Action: null` y aplica la
 * transición por defecto del paso.
 */
export const CM_ACTIONS = {
  /** `CM02-Advance` — "Assign to team": Asignación → Ejecución */
  ASSIGN: 261333,
  /** `CM02-Reject` — "Reject and close": Asignación → Cancelado */
  REJECT_AND_CLOSE: 261334,
  /** `CM03-Advance` — "Conclude activity": Ejecución → Contabilidad */
  CONCLUDE: 261335,
  /** `CM03-Return` — "Change assignee", sin salir de Ejecución */
  CHANGE_ASSIGNEE: 384552,
  /** `CM05-Advance` — "Approve": el supervisor aprueba el cierre */
  APPROVE: 280088,
  /** `CM05-Back` — "Back to assignment": devuelve el trabajo a Asignación */
  BACK_TO_ASSIGNMENT: 280089,
} as const;

/** Lookup `MaintProcess - Outcome`: cierre satisfactorio. */
export const CM_OUTCOME_POSITIVE = 261326;

/**
 * IDs del lookup `COMMON - Priority`. Son **cuatro**, no tres: el formulario de
 * reporte solo ofrece Alta/Media/Baja, pero openMAINT también tiene Crítico y
 * puede llegar en instancias creadas desde allí.
 */
export const CM_PRIORITY_IDS = {
  CRITICAL: 117,
  HIGH: 118,
  MEDIUM: 119,
  LOW: 120,
} as const;

/**
 * ID → nombre estable, expuesto por la API pública. No se usa
 * `_Priority_description_translation` porque viaja traducido según el idioma
 * de la sesión, igual que pasa con el estado.
 */
export const CM_PRIORITY_CODES: Record<number, string> = {
  [CM_PRIORITY_IDS.CRITICAL]: 'Critical',
  [CM_PRIORITY_IDS.HIGH]: 'High',
  [CM_PRIORITY_IDS.MEDIUM]: 'Medium',
  [CM_PRIORITY_IDS.LOW]: 'Low',
};

/**
 * Estados en los que `ExpExecStartDate` es escribible. Fuera de aquí OpenMAINT
 * acepta el PUT pero descarta el atributo en silencio.
 */
export const CM_PLANNED_START_WRITABLE_STATUS: CmStatusId[] = [
  CM_STATUS_IDS.ASSIGNMENT,
];

/**
 * Estados en los que se puede reasignar el cesionario sin avanzar el flujo
 * (`Assignee` escribible en CM02, CM03 y CM07).
 */
export const CM_ASSIGNEE_WRITABLE_STATUS: CmStatusId[] = [
  CM_STATUS_IDS.ASSIGNMENT,
  CM_STATUS_IDS.EXECUTION,
  CM_STATUS_IDS.MANAGEMENT,
];

/** El trabajo espera revisión del supervisor en el paso de contabilidad. */
export const CM_PENDING_REVIEW_STATUS: CmStatusId = CM_STATUS_IDS.ACCOUNTING;
