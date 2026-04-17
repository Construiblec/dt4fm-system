export const PHASE_IDS = {
  ASSIGNED: 1776119,
  IN_EXECUTION: 1776135,
  COMPLETED: 1776138,
  REVIEWED: 1776141,
  CANCELLED: 1776147,
} as const;

export type PhaseId = (typeof PHASE_IDS)[keyof typeof PHASE_IDS];

/** Nombres de fase tal como los devuelve _phase_description de OpenMAINT */
export const PHASE_NAMES: Record<PhaseId, string> = {
  [PHASE_IDS.ASSIGNED]: 'Assigned',
  [PHASE_IDS.IN_EXECUTION]: 'InExecution',
  [PHASE_IDS.COMPLETED]: 'Completed',
  [PHASE_IDS.REVIEWED]: 'Reviewed',
  [PHASE_IDS.CANCELLED]: 'Cancelled',
};

/** Mapeo inverso: descripción de fase → ID numérico */
export const PHASE_DESC_TO_ID: Record<string, PhaseId> = {
  Assigned: PHASE_IDS.ASSIGNED,
  InExecution: PHASE_IDS.IN_EXECUTION,
  Completed: PHASE_IDS.COMPLETED,
  Reviewed: PHASE_IDS.REVIEWED,
  Cancelled: PHASE_IDS.CANCELLED,
};

/** Transiciones válidas por fase */
export const PHASE_TRANSITIONS: Record<PhaseId, PhaseId[]> = {
  [PHASE_IDS.ASSIGNED]: [PHASE_IDS.IN_EXECUTION, PHASE_IDS.CANCELLED],
  [PHASE_IDS.IN_EXECUTION]: [PHASE_IDS.COMPLETED, PHASE_IDS.CANCELLED],
  [PHASE_IDS.COMPLETED]: [PHASE_IDS.REVIEWED, PHASE_IDS.IN_EXECUTION],
  [PHASE_IDS.REVIEWED]: [PHASE_IDS.IN_EXECUTION],
  [PHASE_IDS.CANCELLED]: [],
};
