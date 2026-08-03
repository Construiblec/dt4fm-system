/** Proceso de OpenMAINT que modela el mantenimiento preventivo. */
export const PREVENTIVE_MAINT_PROCESS = 'PreventiveMaint';

/** IDs del lookup `Process - ProcessStatus` correspondientes al flujo PM. */
export const PM_STATUS_IDS = {
  PLANNING: 277465,
  ACCEPTANCE: 261328,
  EXECUTION: 261329,
  SUSPENSION: 266628,
  COMPLETED: 261330,
  CANCELED: 278779,
} as const;

export type PmStatusId = (typeof PM_STATUS_IDS)[keyof typeof PM_STATUS_IDS];

/**
 * Nombre estable de cada estado, expuesto por la API pública.
 * No se usa la descripción de OpenMAINT porque viene traducida según el idioma
 * de la sesión y no sirve como identificador.
 */
export const PM_STATUS_NAMES: Record<PmStatusId, string> = {
  [PM_STATUS_IDS.PLANNING]: 'Planning',
  [PM_STATUS_IDS.ACCEPTANCE]: 'Acceptance',
  [PM_STATUS_IDS.EXECUTION]: 'Execution',
  [PM_STATUS_IDS.SUSPENSION]: 'Suspension',
  [PM_STATUS_IDS.COMPLETED]: 'Completed',
  [PM_STATUS_IDS.CANCELED]: 'Canceled',
};

/** Mapeo inverso: nombre estable → ID del lookup (para filtrar en OpenMAINT). */
export const PM_STATUS_NAME_TO_ID: Record<string, PmStatusId> = {
  Planning: PM_STATUS_IDS.PLANNING,
  Acceptance: PM_STATUS_IDS.ACCEPTANCE,
  Execution: PM_STATUS_IDS.EXECUTION,
  Suspension: PM_STATUS_IDS.SUSPENSION,
  Completed: PM_STATUS_IDS.COMPLETED,
  Canceled: PM_STATUS_IDS.CANCELED,
};

/** Códigos tal como los devuelve `_ProcessStatus_code` → nombre estable. */
export const PM_STATUS_CODE_TO_NAME: Record<string, string> = {
  'PM-Opening': 'Planning',
  'PM-Assignment': 'Acceptance',
  'PM-Execution': 'Execution',
  'PM-Suspension': 'Suspension',
  'PM-Completed': 'Completed',
  'PM-Canceled': 'Canceled',
};

/** Valores aceptados por el filtro `status` de la API. */
export const VALID_PM_STATUSES = Object.values(PM_STATUS_NAMES);

/**
 * Estados que el técnico ve en su dashboard: los que tiene pendientes de
 * atender. Al completarse, el mantenimiento sale de la lista por sí solo.
 */
export const PM_ACTIVE_STATUS_IDS: PmStatusId[] = [
  PM_STATUS_IDS.ACCEPTANCE,
  PM_STATUS_IDS.EXECUTION,
  PM_STATUS_IDS.SUSPENSION,
];

/**
 * IDs del lookup `Process - Action`. Con el código en vez del ID, OpenMAINT
 * guarda `Action: null` y aplica la transición por defecto del paso.
 */
export const PM_ACTIONS = {
  /** `PM02-Advance`: Aceptación → Ejecución */
  START_EXECUTION: 266618,
  /** `PM03-Advance`: Ejecución → Completado */
  CONCLUDE: 266622,
  /** `PM03-Back`: Ejecución → Suspensión */
  SUSPEND: 266624,
  /** `PM04-Advance`: Suspensión → Ejecución */
  RESUME: 266626,
} as const;

/** Lookup `MaintProcess - Outcome`: cierre satisfactorio. */
export const PM_OUTCOME_POSITIVE = 261326;

/** Motivo de la suspensión. OpenMAINT lo limpia por su cuenta al reanudar. */
export const PM_SUSPENSION_REASON_ATTR = 'SuspensionReason';

/** Lookup del que salen las opciones del motivo de suspensión. */
export const PM_SUSPENSION_REASON_LOOKUP = 'MaintProcess - SuspensionReason';
