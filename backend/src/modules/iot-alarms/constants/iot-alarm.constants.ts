import { CM_PRIORITY_IDS } from '../../maintenance-supervision/constants/corrective-maint.constants';

/**
 * IDs del lookup `MaintProcess - Type`, verificados contra la instancia el
 * 2026-08-26.
 *
 * Ojo: openMAINT acepta el atributo `Type` en CM01 y lo descarta en silencio —
 * ninguna instancia lo tiene guardado, tampoco las 34 que creó el reporte
 * manual con `Extraordinary`. Se envía por consistencia, pero el origen IoT se
 * distingue por el `Requester` y por el prefijo del asunto, no por aquí.
 */
export const MAINT_PROCESS_TYPE = {
  BREAKDOWN: 261331,
  DAMAGE: 261332,
  EXTRAORDINARY: 268288,
} as const;

export type AlarmRule = {
  priority: number;
  processType: number;
};

const DEFAULT_RULE: AlarmRule = {
  priority: CM_PRIORITY_IDS.CRITICAL,
  processType: MAINT_PROCESS_TYPE.BREAKDOWN,
};

/**
 * Excepciones por tipo de evento. Nace vacío a propósito: la Pi ya manda
 * `message` en lenguaje humano, así que solo hace falta una entrada aquí para
 * desviarse del valor por defecto (bajar la prioridad de un evento ruidoso).
 */
export const IOT_ALARM_OVERRIDES: Record<string, Partial<AlarmRule>> = {};

/** Único punto de acceso a las reglas: migrarlas a base de datos se hace aquí. */
export const resolveAlarmRule = (event: string): AlarmRule => ({
  ...DEFAULT_RULE,
  ...(IOT_ALARM_OVERRIDES[event] ?? {}),
});

/** Marca el origen automático en el asunto del correctivo. */
export const IOT_SUBJECT_PREFIX = '[IoT]';

/** Nombre que ve el supervisor. openMAINT guarda el empleado como "Iot Sistema". */
export const IOT_REQUESTER_LABEL = 'Sistema IoT';

/** `ShortDescr` es una columna de 255 en CMDBuild. */
export const SHORT_DESCR_MAX = 255;
