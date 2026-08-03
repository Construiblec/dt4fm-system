/** Clase que guarda el checklist resuelto de cada instancia de PreventiveMaint. */
export const PREV_MAINT_TASKS_CLASS = 'PrevMaintTasks';

/** Clase con la definición de cada actividad del checklist. */
export const PREV_MAINT_TASK_CLASS = 'PrevMaintTask';

/** IDs del lookup `COMMON - SQLType` que usa el atributo `Type` de cada actividad. */
export const CHECKLIST_FIELD_TYPES = {
  DATE: 384651,
  TIME: 384652,
  NUMBER: 384653,
  LOOKUP: 384654,
  POS_NEG: 384655,
  TEXT: 384656,
  FLAG: 384657,
  TIMESTAMP: 384658,
} as const;

/** Clase de campo que el frontend sabe renderizar. */
export type ChecklistFieldKind =
  | 'date'
  | 'time'
  | 'number'
  | 'lookup'
  | 'posneg'
  | 'text'
  | 'flag'
  | 'datetime';

export const CHECKLIST_FIELD_KINDS: Record<number, ChecklistFieldKind> = {
  [CHECKLIST_FIELD_TYPES.DATE]: 'date',
  [CHECKLIST_FIELD_TYPES.TIME]: 'time',
  [CHECKLIST_FIELD_TYPES.NUMBER]: 'number',
  [CHECKLIST_FIELD_TYPES.LOOKUP]: 'lookup',
  [CHECKLIST_FIELD_TYPES.POS_NEG]: 'posneg',
  [CHECKLIST_FIELD_TYPES.TEXT]: 'text',
  [CHECKLIST_FIELD_TYPES.FLAG]: 'flag',
  [CHECKLIST_FIELD_TYPES.TIMESTAMP]: 'datetime',
};

/**
 * Lookup fijo del que salen las opciones de los tipos `posneg` y `flag`.
 * Contiene los cuatro valores juntos, así que hay que repartirlos por tipo.
 */
export const PM_TASK_OUTCOME_LOOKUP = 'PrevMaintTasks - Outcome';

/** Ok / Ko — opciones válidas para las actividades de tipo `posneg`. */
export const POSNEG_OPTION_IDS = [345544, 345546];

/** Hecho / Que hacer — opciones válidas para las actividades de tipo `flag`. */
export const FLAG_OPTION_IDS = [345548, 345550];

/** Los tipos cuyas opciones salen del lookup fijo, no de uno configurable. */
export const FIXED_OPTION_IDS_BY_KIND: Partial<
  Record<ChecklistFieldKind, number[]>
> = {
  posneg: POSNEG_OPTION_IDS,
  flag: FLAG_OPTION_IDS,
};
