import { resolveCorrectiveStatus } from '../../src/modules/maintenance-supervision/constants/corrective-maint.constants';
import {
  PM_ACTIONS,
  PM_STATUS_CODE_TO_NAME,
} from '../../src/modules/preventive-maintenance/constants/preventive-maint.constants';
import type {
  CorrectiveMaintOpenmaintServiceMock,
  PreventiveMaintenanceOpenmaintServiceMock,
} from '../mocks/gateways.mock';
import { MOCK_SESSION_ID } from '../mocks/openmaint-core.mock';

export type StoredOrder = Record<string, any> & { _id: number };
export type StoredAttachment = Record<string, any> & { _id: string };

export const upstreamError = (status: number) =>
  Object.assign(
    new Error(`openMAINT respondió ${status} en http://openmaint.invalid`),
    { response: { status } },
  );

type Range = { from?: string; to?: string } | undefined;

/** Rango `[desde, hasta)`; sin fecha en la tarjeta no cumple un rango. */
const inRange = (value: unknown, range: Range): boolean => {
  if (!range?.from && !range?.to) return true;
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (Number.isNaN(time)) return false;
  return (
    (!range.from || time >= Date.parse(range.from)) &&
    (!range.to || time < Date.parse(range.to))
  );
};

const CORRECTIVE_CODES: Record<string, string> = {
  Opening: 'CM-Opening',
  Assignment: 'CM-Assignment',
  Management: 'CM-Management',
  Estimate: 'CM-Estimate',
  Control: 'CM-Control',
  Execution: 'CM-Execution',
  Accounting: 'CM-Accounting',
  Completed: 'CM-Completed',
  Canceled: 'CM-Canceled',
};

const PREVENTIVE_CODES: Record<string, string> = {
  Planning: 'PM-Opening',
  Acceptance: 'PM-Assignment',
  Execution: 'PM-Execution',
  Suspension: 'PM-Suspension',
  Completed: 'PM-Completed',
  Canceled: 'PM-Canceled',
};

// Sin repetir entre procesos: el servicio recuerda ids en su caché.
let nextId = Number(process.env.JEST_WORKER_ID ?? 1) * 2_000_000;

const orderOf = (
  prefix: string,
  statusCode: string,
  overrides: Record<string, unknown>,
): StoredOrder => {
  const id = (overrides._id as number | undefined) ?? ++nextId;
  return {
    Number: `${prefix}.2026.${id}`,
    ShortDescr: `Orden ${id}`,
    _ProcessStatus_code: statusCode,
    _ProcessStatus_description: statusCode,
    _FlowStatus_code: 'open.running',
    Site: 3019998,
    _Site_description: 'Pradera',
    OpeningDate: '2026-11-10T13:00:00Z',
    ...overrides,
    _id: id,
  };
};

/** Fuente en memoria de correctivos y preventivos: lo guardado es lo que se lee. */
export class MaintenanceStore {
  readonly correctives = new Map<number, StoredOrder>();
  readonly preventives = new Map<number, StoredOrder>();
  readonly attachments = new Map<string, StoredAttachment[]>();
  readonly checklists = new Map<number, unknown[]>();
  employees: StoredOrder[] = [];
  /** Lo que los gateways preventivos recibieron al escribir. */
  readonly advances: {
    id: number;
    action: number;
    notes?: string;
    fields: any;
  }[] = [];
  readonly saves: { id: number; fields: any }[] = [];
  /** Actividad activa de cada preventivo: cada avance gasta la anterior. */
  private readonly activities = new Map<number, number>();

  corrective(
    status: string,
    overrides: Record<string, unknown> = {},
  ): StoredOrder {
    const card = orderOf('CM', CORRECTIVE_CODES[status], {
      Priority: 118,
      _Priority_description: 'Alta',
      ...overrides,
    });
    this.correctives.set(card._id, card);
    return card;
  }

  preventive(
    status: string,
    overrides: Record<string, unknown> = {},
  ): StoredOrder {
    const card = orderOf('PM', PREVENTIVE_CODES[status], overrides);
    this.preventives.set(card._id, card);
    return card;
  }

  attach(
    kind: 'corrective' | 'preventive',
    orderId: number,
    attachment: StoredAttachment,
  ): void {
    const key = `${kind}:${orderId}`;
    this.attachments.set(key, [
      ...(this.attachments.get(key) ?? []),
      attachment,
    ]);
  }

  /** Enchufa los falsos de los gateways y de los empleados. */
  install(mocks: {
    correctiveOpenmaint: CorrectiveMaintOpenmaintServiceMock;
    preventiveOpenmaint: PreventiveMaintenanceOpenmaintServiceMock;
    openmaint: { getEmployees: jest.Mock };
  }): void {
    // Todo lo que no use la sesión de servicio compartida es un error del código.
    const withSession = <A extends unknown[], R>(fn: (...args: A) => R) =>
      jest.fn((sessionId: string, ...args: A) => {
        if (sessionId !== MOCK_SESSION_ID) {
          return Promise.reject(new Error(`sesión inesperada: ${sessionId}`));
        }
        return fn(...args);
      });

    const { correctiveOpenmaint: cm, preventiveOpenmaint: pm } = mocks;

    cm.search
      .mockReset()
      .mockImplementation(
        withSession((options: any) =>
          Promise.resolve(this.page(this.filterCorrectives(options), options)),
        ),
      );
    pm.search
      .mockReset()
      .mockImplementation(
        withSession((options: any) =>
          Promise.resolve(this.page(this.filterPreventives(options), options)),
        ),
      );

    pm.findWithTasklist.mockReset().mockImplementation(
      withSession((id: number) =>
        this.byId(this.preventives, id).then(({ data }) => ({
          data: { ...data, _tasklist: [{ _id: this.activityOf(id) }] },
        })),
      ),
    );
    pm.advance
      .mockReset()
      .mockImplementation(
        withSession((id: number, options: any) =>
          this.advancePreventive(id, options),
        ),
      );
    pm.saveFields
      .mockReset()
      .mockImplementation(
        withSession((id: number, options: any) =>
          this.savePreventive(id, options),
        ),
      );

    cm.findById
      .mockReset()
      .mockImplementation(
        withSession((id: number) => this.byId(this.correctives, id)),
      );
    pm.findById
      .mockReset()
      .mockImplementation(
        withSession((id: number) => this.byId(this.preventives, id)),
      );

    cm.findAttachments.mockReset().mockImplementation(
      withSession((id: number) =>
        Promise.resolve({
          data: this.attachments.get(`corrective:${id}`) ?? [],
        }),
      ),
    );
    pm.findAttachments.mockReset().mockImplementation(
      withSession((id: number) =>
        Promise.resolve({
          data: this.attachments.get(`preventive:${id}`) ?? [],
        }),
      ),
    );

    const download = (kind: string) =>
      withSession((id: number, attachmentId: string) => {
        const found = (this.attachments.get(`${kind}:${id}`) ?? []).find(
          (a) => a._id === attachmentId,
        );
        return found
          ? Promise.resolve({
              data: Buffer.from(found.content ?? 'contenido'),
              contentType: found.contentType ?? 'image/jpeg',
              fileName: 'nombre-de-la-fuente.jpg',
            })
          : Promise.reject(upstreamError(404));
      });
    cm.downloadAttachment
      .mockReset()
      .mockImplementation(download('corrective'));
    pm.downloadAttachment
      .mockReset()
      .mockImplementation(download('preventive'));

    pm.findChecklistCard.mockReset().mockImplementation(
      withSession((processId: number) => {
        const items = this.checklists.get(processId);
        return Promise.resolve({
          data: items ? [{ _id: processId, Data: JSON.stringify(items) }] : [],
        });
      }),
    );

    mocks.openmaint.getEmployees.mockReset().mockImplementation(
      withSession((teamId?: number) =>
        Promise.resolve({
          data: this.employees.filter(
            (e) => teamId === undefined || e.Team === teamId,
          ),
        }),
      ),
    );
  }

  private activityOf(id: number): string {
    return `act-${id}-${this.activities.get(id) ?? 0}`;
  }

  private describeAssignee(card: StoredOrder): void {
    const found = this.employees.find((e) => e._id === card.Assignee);
    if (found) card._Assignee_description = found.Description;
  }

  /** Como la fuente: una actividad gastada falla; un avance sin salida no mueve nada. */
  private advancePreventive(
    id: number,
    options: {
      activityId: string;
      action: number;
      notes?: string;
      fields?: any;
    },
  ) {
    const card = this.preventives.get(id);
    if (!card) return Promise.reject(upstreamError(404));
    if (options.activityId !== this.activityOf(id)) {
      return Promise.reject(
        Object.assign(new Error('tarea gastada'), {
          response: {
            status: 500,
            data: {
              messages: [{ message: 'task not found for instanceId 1' }],
            },
          },
        }),
      );
    }
    this.advances.push({
      id,
      action: options.action,
      notes: options.notes,
      fields: options.fields ?? {},
    });

    const status = PM_STATUS_CODE_TO_NAME[card._ProcessStatus_code];
    const moveTo = (code: string, flow = 'open.running') => {
      Object.assign(card, options.fields, {
        _ProcessStatus_code: code,
        _FlowStatus_code: flow,
      });
      this.describeAssignee(card);
      this.activities.set(id, (this.activities.get(id) ?? 0) + 1);
    };
    if (options.action === PM_ACTIONS.ASSIGN && status === 'Planning') {
      moveTo('PM-Assignment');
    } else if (options.action === PM_ACTIONS.CANCEL && status === 'Planning') {
      moveTo('PM-Canceled', 'closed.aborted');
    } else if (
      options.action === PM_ACTIONS.CHANGE_ASSIGNEE &&
      status === 'Suspension'
    ) {
      moveTo('PM-Suspension');
    }
    return Promise.resolve({ data: {} });
  }

  /** Lo que el paso no declara escribible se descarta en silencio. */
  private savePreventive(
    id: number,
    options: { activityId: string; fields: Record<string, unknown> },
  ) {
    const card = this.preventives.get(id);
    if (!card) return Promise.reject(upstreamError(404));
    this.saves.push({ id, fields: options.fields });

    const status = PM_STATUS_CODE_TO_NAME[card._ProcessStatus_code];
    const writable =
      status === 'Acceptance'
        ? ['Assignee', 'ExpExecStartDate']
        : status === 'Execution'
          ? ['Assignee']
          : [];
    for (const [name, value] of Object.entries(options.fields)) {
      if (writable.includes(name)) card[name] = value;
    }
    this.describeAssignee(card);
    return Promise.resolve({ data: {} });
  }

  private byId(map: Map<number, StoredOrder>, id: number) {
    const card = map.get(id);
    return card
      ? Promise.resolve({ data: card })
      : Promise.reject(upstreamError(404));
  }

  private page(cards: StoredOrder[], options: any) {
    return {
      data: cards.slice(options.offset, options.offset + options.limit),
      meta: { total: cards.length },
    };
  }

  private common(card: StoredOrder, o: any): boolean {
    return (
      (o.assigned === undefined ||
        (o.assigned ? !!card.Assignee : !card.Assignee)) &&
      (o.employeeId === undefined || card.Assignee === o.employeeId) &&
      (o.teamId === undefined || card.Team === o.teamId) &&
      (o.buildingId === undefined || card.Site === o.buildingId) &&
      inRange(card.OpeningDate, o.opened) &&
      inRange(card.ExpExecStartDate, o.planned) &&
      inRange(card.ExecStartDate, o.started) &&
      inRange(card.ExecEndDate, o.ended)
    );
  }

  private filterCorrectives(o: any): StoredOrder[] {
    return [...this.correctives.values()]
      .filter((card) => {
        const status = resolveCorrectiveStatus(
          card._ProcessStatus_code,
          card.ExecStartDate,
        );
        return (
          (o.status === undefined || status === o.status) &&
          (o.unitId === undefined || card.Unit === o.unitId) &&
          (o.priorityId === undefined || card.Priority === o.priorityId) &&
          (o.categoryId === undefined || card.Category === o.categoryId) &&
          (o.subcategoryId === undefined ||
            card.Subcategory === o.subcategoryId) &&
          this.common(card, o)
        );
      })
      .sort((a, b) => b._id - a._id);
  }

  private filterPreventives(o: any): StoredOrder[] {
    return [...this.preventives.values()]
      .filter(
        (card) =>
          (o.status === undefined ||
            PM_STATUS_CODE_TO_NAME[card._ProcessStatus_code] === o.status) &&
          (o.assetId === undefined || card.CI === o.assetId) &&
          (o.planId === undefined || card.PrevMaintConfig === o.planId) &&
          inRange(card.DueExecEndDate, o.due) &&
          this.common(card, o),
      )
      .sort((a, b) => b._id - a._id);
  }
}
