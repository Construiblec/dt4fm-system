import {
  CM_STATUS_IDS,
  CmStatusId,
} from '../../src/modules/maintenance-supervision/constants/corrective-maint.constants';

/**
 * Tarjeta CorrectiveMaint mínima para el camino feliz de cada paso.
 *
 * `ProcessStatus` va como ID numérico (no el código `CM-Execution`, ese es
 * `_ProcessStatus_code`) — es lo que exigen tanto incidents.service.ts como
 * maintenance-supervision.service.ts al leer la tarjeta.
 */
export interface CorrectiveCardOptions {
  id?: number;
  status: CmStatusId;
  execStartDate?: string | null;
  execEndDate?: string | null;
  assignee?: number | null;
  team?: number | null;
  expExecStartDate?: string | null;
  number?: string;
  taskId?: string;
  register?: string;
}

const CM_STATUS_CODE_BY_ID: Record<CmStatusId, string> = {
  [CM_STATUS_IDS.OPENING]: 'CM-Opening',
  [CM_STATUS_IDS.ASSIGNMENT]: 'CM-Assignment',
  [CM_STATUS_IDS.MANAGEMENT]: 'CM-Management',
  [CM_STATUS_IDS.ESTIMATE]: 'CM-Estimate',
  [CM_STATUS_IDS.CONTROL]: 'CM-Control',
  [CM_STATUS_IDS.EXECUTION]: 'CM-Execution',
  [CM_STATUS_IDS.ACCOUNTING]: 'CM-Accounting',
  [CM_STATUS_IDS.COMPLETED]: 'CM-Completed',
  [CM_STATUS_IDS.CANCELED]: 'CM-Canceled',
};

export const correctiveCard = (opts: CorrectiveCardOptions) => ({
  _id: opts.id ?? 12345,
  Number: opts.number ?? 'CM.2026.0150',
  ProcessStatus: opts.status,
  _ProcessStatus_code: CM_STATUS_CODE_BY_ID[opts.status],
  _ProcessStatus_description: 'Mock status',
  ExecStartDate: opts.execStartDate ?? null,
  ExecEndDate: opts.execEndDate ?? null,
  ExpExecStartDate: opts.expExecStartDate ?? null,
  Assignee: opts.assignee ?? null,
  Team: opts.team ?? null,
  ShortDescr: 'Mock incident location',
  _Site_description: 'Mock Building',
  _Priority_description: 'Alta',
  OpeningDate: new Date().toISOString(),
  Register: opts.register ?? '<span data-block="notes">Mock notes</span>',
  _tasklist: [{ _id: opts.taskId ?? 'TASK-123', writable: true }],
});

/** Respuesta `{ data }` que devuelven findWithTasklist / findById. */
export const correctiveResponse = (opts: CorrectiveCardOptions) => ({
  data: correctiveCard(opts),
});
