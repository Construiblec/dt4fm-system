import {
  PM_STATUS_IDS,
  PmStatusId,
} from '../../src/modules/preventive-maintenance/constants/preventive-maint.constants';

const PM_STATUS_CODE_BY_ID: Record<PmStatusId, string> = {
  [PM_STATUS_IDS.PLANNING]: 'PM-Opening',
  [PM_STATUS_IDS.ACCEPTANCE]: 'PM-Assignment',
  [PM_STATUS_IDS.EXECUTION]: 'PM-Execution',
  [PM_STATUS_IDS.SUSPENSION]: 'PM-Suspension',
  [PM_STATUS_IDS.COMPLETED]: 'PM-Completed',
  [PM_STATUS_IDS.CANCELED]: 'PM-Canceled',
};

export interface PreventiveCardOptions {
  id?: number;
  status: PmStatusId;
  execStartDate?: string | null;
  execEndDate?: string | null;
  dueExecEndDate?: string | null;
  expExecStartDate?: string | null;
  assignee?: number | null;
  team?: number | null;
  number?: string;
  taskId?: string;
  flowClosed?: boolean;
  prevMaintConfig?: number | null;
  suspensionReason?: string | null;
}

export const preventiveCard = (opts: PreventiveCardOptions) => ({
  _id: opts.id ?? 54321,
  Number: opts.number ?? 'PM.2026.0002',
  ProcessStatus: opts.status,
  _ProcessStatus_code: PM_STATUS_CODE_BY_ID[opts.status],
  _FlowStatus_code: opts.flowClosed ? 'closed.completed' : 'open.instance',
  ExecStartDate: opts.execStartDate ?? null,
  ExecEndDate: opts.execEndDate ?? null,
  DueExecEndDate: opts.dueExecEndDate ?? null,
  ExpExecStartDate: opts.expExecStartDate ?? null,
  Assignee: opts.assignee ?? null,
  Team: opts.team ?? null,
  CISubset: 8811001,
  CI: null,
  _CISubset_description: 'Mock Equipment',
  _CI_description: null,
  Site: 3019998,
  Register: null,
  _Register_html: null,
  _SuspensionReason_description: opts.suspensionReason ?? null,
  _SuspensionReason_description_translation: opts.suspensionReason ?? null,
  OpeningDate: new Date().toISOString(),
  PrevMaintConfig: opts.prevMaintConfig ?? null,
  _tasklist: [{ _id: opts.taskId ?? 'PM-TASK-123', writable: true }],
});

export const preventiveResponse = (opts: PreventiveCardOptions) => ({
  data: preventiveCard(opts),
});

export interface ChecklistItemOptions {
  taskDefId: number;
  type?: number;
  outcome?: string | null;
  nd?: boolean;
  execOrder?: number;
  description?: string;
}

/** Tipos de `CHECKLIST_FIELD_TYPES` — texto libre por defecto. */
const DEFAULT_FIELD_TYPE = 1;

export const checklistItem = (opts: ChecklistItemOptions) => ({
  TaskDef: opts.taskDefId,
  Type: opts.type ?? DEFAULT_FIELD_TYPE,
  ExecOrder: opts.execOrder ?? 1,
  Outcome: opts.outcome ?? null,
  ND: opts.nd ?? false,
  Modified: null,
  _TaskDef_description: opts.description ?? `Tarea ${opts.taskDefId}`,
  _CI_description: 'Mock Equipment',
});

export const checklistCard = (
  id: number,
  items: ReturnType<typeof checklistItem>[],
) => ({
  data: [{ _id: id, Data: JSON.stringify(items) }],
});
