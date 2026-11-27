import { BadRequestException, Logger } from '@nestjs/common';
import { CM_ACTIONS } from './constants/corrective-maint.constants';
import { CorrectiveFlow } from './flows/corrective-flow';
import { PreventiveFlow } from './flows/preventive-flow';
import { MaintenancePlanningService } from './maintenance-planning.service';

const BACK_ACTION = 555;
const START = '2026-11-26T15:00:00.000Z';
const OTHER = '2026-11-27T15:00:00.000Z';

const CODES: Record<string, string> = {
  Assignment: 'CM-Assignment',
  Management: 'CM-Management',
  Execution: 'CM-Execution',
  Canceled: 'CM-Canceled',
  Completed: 'CM-Completed',
};
const NAME_OF = Object.fromEntries(
  Object.entries(CODES).map(([name, code]) => [code, name]),
);

const TEAM = [
  { _id: 7, Description: 'Luis', Team: 501, _type: 'InternalEmployee' },
  { _id: 8, Description: 'Ana', Team: 501, _type: 'InternalEmployee' },
];

const SUB = { id: 31, name: 'Fuga de agua', isOther: false };
const SUB_OTHER = { id: 32, name: 'Otro', isOther: true };
const CATEGORY = {
  id: 30,
  code: 'MNT',
  name: 'Mantenimiento',
  subcategories: [SUB, SUB_OTHER],
};

type Card = Record<string, any> & { _id: number };

const order = (
  id: number,
  status: string,
  over: Record<string, unknown> = {},
): Card => ({
  _id: id,
  Number: `CM.2026.${id}`,
  ShortDescr: 'Fuga de agua',
  _ProcessStatus_code: CODES[status],
  _FlowStatus_code: 'open.running',
  Assignee: null,
  Team: 501,
  Priority: 118,
  Category: 30,
  Subcategory: 31,
  ExpExecStartDate: START,
  ExecStartDate: null,
  _Unit_description: 'Depto 402',
  _Site_description: 'Pradera',
  ...over,
});

const upstream = (status: number) =>
  Object.assign(new Error(`fuente ${status}`), { response: { status } });

/** Fuente en memoria: al entrar en Execution copia la fecha prevista al inicio real. */
const build = (
  cards: Card[],
  {
    discard = [] as string[],
    back = String(BACK_ACTION) as string | null,
  } = {},
) => {
  const store = new Map(cards.map((card) => [card._id, { ...card }]));
  const statusOf = (card: Card) => NAME_OF[card._ProcessStatus_code as string];

  const gateway = {
    findWithTasklist: jest.fn((_s: string, id: number): Promise<unknown> => {
      const card = store.get(id);
      return card
        ? Promise.resolve({
            data: { ...card, _tasklist: [{ _id: `act-${id}` }] },
          })
        : Promise.reject(upstream(404));
    }),
    advance: jest.fn(
      (_s: string, id: number, o: Record<string, any>): Promise<unknown> => {
        const card = store.get(id)!;
        const status = statusOf(card);
        const fields = Object.fromEntries(
          Object.entries(o.fields ?? {}).filter(
            ([name]) => !discard.includes(name),
          ),
        );
        if (o.action === CM_ACTIONS.ASSIGN && status === 'Assignment') {
          Object.assign(card, fields, {
            _ProcessStatus_code: CODES.Execution,
          });
          card.ExecStartDate = card.ExpExecStartDate as string | null;
        } else if (
          o.action === CM_ACTIONS.CHANGE_ASSIGNEE &&
          status === 'Execution'
        ) {
          Object.assign(card, fields);
          card.ExecStartDate = card.ExpExecStartDate as string | null;
        } else if (
          o.action === CM_ACTIONS.REJECT_AND_CLOSE &&
          status === 'Assignment'
        ) {
          Object.assign(card, {
            _ProcessStatus_code: CODES.Canceled,
            _FlowStatus_code: 'closed.aborted',
          });
        } else if (o.action === BACK_ACTION && status === 'Execution') {
          card._ProcessStatus_code = CODES.Assignment;
        }
        return Promise.resolve({});
      },
    ),
    saveFields: jest.fn(
      (_s: string, id: number, o: Record<string, any>): Promise<unknown> => {
        const card = store.get(id)!;
        const status = statusOf(card);
        const writable =
          status === 'Assignment'
            ? [
                'ExpExecStartDate',
                'Team',
                'Priority',
                'Category',
                'Subcategory',
                'ShortDescr',
              ]
            : status === 'Execution'
              ? ['ExecStartDate', 'Assignee']
              : status === 'Management'
                ? ['Assignee', 'Team']
                : [];
        for (const [name, value] of Object.entries(o.fields)) {
          if (writable.includes(name) && !discard.includes(name)) {
            card[name] = value;
          }
        }
        return Promise.resolve({});
      },
    ),
  };
  const openmaint = {
    readEmployeeCard: jest.fn(
      (): Promise<unknown> => Promise.reject(new Error('sin ficha')),
    ),
    getEmployees: jest.fn(
      (): Promise<unknown> => Promise.resolve({ data: TEAM }),
    ),
  };
  const session = {
    isCoolingDown: jest.fn().mockReturnValue(false),
    getSessionId: jest.fn().mockResolvedValue('sesion'),
    invalidateSession: jest.fn(),
  };
  const config = {
    get: jest.fn((name: string): string | undefined =>
      name === 'OPENMAINT_CM_BACK_TO_ASSIGNMENT_ACTION_ID'
        ? (back ?? undefined)
        : '501,502',
    ),
  };
  const push = {
    notifyPreventiveAssigned: jest.fn(
      (): Promise<unknown> => Promise.resolve(),
    ),
    notifyCorrectiveAssigned: jest.fn(
      (): Promise<unknown> => Promise.resolve(),
    ),
    notifyMaintenancePlanUpdated: jest.fn(
      (): Promise<unknown> => Promise.resolve(),
    ),
  };
  const categories = {
    resolve: jest.fn((categoryId: number, subcategoryId: number) => {
      const subcategory = CATEGORY.subcategories.find(
        (s) => s.id === subcategoryId,
      );
      return categoryId === CATEGORY.id && subcategory
        ? Promise.resolve({ category: CATEGORY, subcategory })
        : Promise.reject(
            new BadRequestException(
              'La subcategoría no pertenece a la categoría elegida',
            ),
          );
    }),
  };
  const service = new MaintenancePlanningService(
    new PreventiveFlow({} as never),
    openmaint as never,
    session as never,
    config as never,
    push as never,
    new CorrectiveFlow(gateway as never, config as never),
    categories as never,
  );
  return { service, gateway, push, categories, store, session };
};

const failureOf = (promise: Promise<unknown>): Promise<Error> =>
  promise.then(
    () => {
      throw new Error('debía fallar');
    },
    (error: Error) => error,
  );

const actionsOf = (calls: unknown[][]): number[] =>
  calls.map(([, , o]) => (o as { action: number }).action);

const like = (value: object) => expect.objectContaining(value) as unknown;

describe('MaintenancePlanningService (correctivos)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('despacho desde Assignment', () => {
    it('avanza con la tarjeta fusionada, borra el inicio real autocopiado y avisa una vez', async () => {
      const { service, gateway, push, categories, store } = build([
        order(10, 'Assignment'),
      ]);

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 7 },
        'agente-uno',
      );

      expect(result).toMatchObject({
        id: 10,
        result: 'applied',
        warnings: [],
        data: {
          kind: 'corrective',
          status: 'Assigned',
          assignee: { id: 7 },
          actualStartTime: null,
        },
      });
      expect(categories.resolve).toHaveBeenCalledWith(30, 31, 'sesion');
      expect(gateway.advance).toHaveBeenCalledTimes(1);
      expect(gateway.advance).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        action: CM_ACTIONS.ASSIGN,
        notes: '[API · agente-uno] Asignación de técnico',
        fields: {
          Assignee: 7,
          Priority: 118,
          Category: 30,
          Subcategory: 31,
          ShortDescr: 'Fuga de agua',
          Team: 501,
        },
      });
      expect(gateway.saveFields).toHaveBeenCalledTimes(1);
      expect(gateway.saveFields).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        fields: { ExecStartDate: null },
      });
      expect(store.get(10)!.ExecStartDate).toBeNull();
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledTimes(1);
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledWith({
        id: 10,
        assigneeId: 7,
        unitName: 'Depto 402',
        floorName: undefined,
        buildingName: 'Pradera',
      });
      expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
    });

    it('repetir con el mismo técnico tras un CM05-Back vuelve a avisarle', async () => {
      const { service, push } = build([
        order(10, 'Assignment', { Assignee: 7 }),
      ]);

      await service.update('corrective', 10, { employeeId: 7 }, 'c');

      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledTimes(1);
      expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
    });

    it('si borrar el inicio real falla, queda aplicado con aviso', async () => {
      const { service, gateway, push } = build([order(10, 'Assignment')]);
      gateway.saveFields.mockRejectedValueOnce(upstream(500));

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 7 },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['exec_start_not_restored'],
        data: { status: 'Execution' },
      });
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledTimes(1);
    });

    it('faltando datos: 400 con lo que falta y sin escribir', async () => {
      const { service, gateway } = build([
        order(10, 'Assignment', { ExpExecStartDate: null, Priority: null }),
      ]);

      const error = await failureOf(
        service.update('corrective', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe('Faltan: plannedStartTime, priority');
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('una subcategoría de otra categoría: 400 de la validación', async () => {
      const { service, gateway } = build([order(10, 'Assignment')]);

      const error = await failureOf(
        service.update(
          'corrective',
          10,
          { employeeId: 7, categoryId: 99, subcategoryId: 31 },
          'c',
        ),
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('si la fuente descarta prioridad o categoría, aviso field_not_saved', async () => {
      const { service } = build([order(10, 'Assignment')], {
        discard: ['Priority'],
      });

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 7, priority: 'Low' },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['field_not_saved'],
      });
    });

    it('sin técnico guarda la tarjeta; con técnico puesto avisa not_dispatched; sin nada, unchanged', async () => {
      const { service, gateway, push } = build([
        order(10, 'Assignment', { Assignee: 7 }),
      ]);

      const saved = await service.update(
        'corrective',
        10,
        { plannedStartTime: OTHER, priority: 'Low' },
        'c',
      );
      expect(saved).toMatchObject({
        result: 'applied',
        warnings: ['not_dispatched'],
        data: { plannedStartTime: OTHER, priority: { code: 'Low' } },
      });
      expect(gateway.advance).not.toHaveBeenCalled();

      const repeated = await service.update(
        'corrective',
        10,
        { plannedStartTime: OTHER, priority: 'Low' },
        'c',
      );
      expect(repeated.result).toBe('unchanged');
      expect(push.notifyCorrectiveAssigned).not.toHaveBeenCalled();
    });

    it('notas sin paso de avance: notes_not_saved', async () => {
      const { service } = build([order(10, 'Assignment')]);

      const result = await service.update(
        'corrective',
        10,
        { priority: 'Low', notes: 'x' },
        'c',
      );

      expect(result.warnings).toEqual(['notes_not_saved']);
    });

    it('solo notas: 400', async () => {
      const { service } = build([order(10, 'Assignment')]);
      await expect(
        service.update('corrective', 10, { notes: 'x' }, 'c'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Assigned', () => {
    const assigned = (over: Record<string, unknown> = {}) =>
      order(10, 'Execution', { Assignee: 7, ...over });

    it('cambio de técnico: CM03-Return, borra el inicio, avisa al nuevo y retira al anterior', async () => {
      const { service, gateway, push } = build([assigned()]);

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 8 },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        data: { status: 'Assigned', assignee: { id: 8 } },
      });
      expect(gateway.advance).toHaveBeenCalledWith(
        'sesion',
        10,
        like({ action: CM_ACTIONS.CHANGE_ASSIGNEE, fields: { Assignee: 8 } }),
      );
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledWith(
        like({ id: 10, assigneeId: 8 }),
      );
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledTimes(1);
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({
          kind: 'corrective',
          id: 10,
          employeeId: 7,
          change: 'removed',
          unitName: 'Depto 402',
          buildingName: 'Pradera',
        }),
      );
    });

    it('reprogramar con la acción: vuelve a asignación, despacha y avisa la nueva fecha al mismo técnico', async () => {
      const { service, gateway, push } = build([assigned()]);

      const result = await service.update(
        'corrective',
        10,
        { plannedStartTime: OTHER },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        data: {
          status: 'Assigned',
          plannedStartTime: OTHER,
          assignee: { id: 7 },
        },
      });
      expect(actionsOf(gateway.advance.mock.calls)).toEqual([
        BACK_ACTION,
        CM_ACTIONS.ASSIGN,
      ]);
      expect(push.notifyCorrectiveAssigned).not.toHaveBeenCalled();
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledTimes(1);
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({ employeeId: 7, change: 'rescheduled' }),
      );
    });

    it('reprogramar y cambiar de técnico: el nuevo recibe la orden y el anterior la pierde', async () => {
      const { service, push } = build([assigned()]);

      await service.update(
        'corrective',
        10,
        { plannedStartTime: OTHER, employeeId: 8 },
        'c',
      );

      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledWith(
        like({ assigneeId: 8 }),
      );
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({ employeeId: 7, change: 'removed' }),
      );
    });

    it('sin la acción: 409 sin escribir nada, y cambiar de técnico sigue funcionando', async () => {
      const { service, gateway } = build([assigned()], { back: null });

      const error = await failureOf(
        service.update('corrective', 10, { priority: 'Low' }, 'c'),
      );
      expect(error.message).toBe(
        'Reprogramar un correctivo ya asignado aún no está disponible; solo se puede cambiar el técnico',
      );
      expect(gateway.advance).not.toHaveBeenCalled();

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 8 },
        'c',
      );
      expect(result.result).toBe('applied');
    });

    it('si el segundo paso falla, 502: quedó por asignar sin aplicar el cambio', async () => {
      const { service, gateway, push, store } = build([assigned()]);
      gateway.advance.mockImplementationOnce(
        (_s: string, id: number): Promise<unknown> => {
          store.get(id)!._ProcessStatus_code = CODES.Assignment;
          return Promise.resolve({});
        },
      );
      gateway.advance.mockRejectedValueOnce(upstream(500));

      const error = await failureOf(
        service.update('corrective', 10, { plannedStartTime: OTHER }, 'c'),
      );

      expect(error.message).toBe(
        'El correctivo quedó por asignar sin aplicar el cambio; comprobar antes de repetir',
      );
      expect(store.get(10)!._ProcessStatus_code).toBe(CODES.Assignment);
      expect(push.notifyCorrectiveAssigned).not.toHaveBeenCalled();
      expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
    });
  });

  describe('Execution empezado', () => {
    it('cambio de técnico: restaura el inicio previo, avisa started y retira al anterior', async () => {
      const startedAt = '2026-11-26T15:05:00.000Z';
      const { service, gateway, push } = build([
        order(10, 'Execution', {
          Assignee: 7,
          ExecStartDate: startedAt,
          ExpExecStartDate: START,
        }),
      ]);

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 8 },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['started'],
        data: { status: 'Execution', actualStartTime: startedAt },
      });
      expect(gateway.saveFields).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        fields: { ExecStartDate: startedAt },
      });
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({ employeeId: 7, change: 'removed' }),
      );
    });

    it('otro campo: 409', async () => {
      const { service, gateway } = build([
        order(10, 'Execution', { Assignee: 7, ExecStartDate: START }),
      ]);

      const error = await failureOf(
        service.update('corrective', 10, { priority: 'Low' }, 'c'),
      );

      expect(error.message).toBe(
        'El correctivo ya empezó: solo se puede cambiar el técnico',
      );
      expect(gateway.advance).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('en asignación: CM02-Reject con el motivo; sin despachar, no avisa al técnico', async () => {
      const { service, gateway, push } = build([
        order(10, 'Assignment', { Assignee: 7 }),
      ]);

      const result = await service.cancel('corrective', 10, 'Duplicado', 'c');

      expect(result).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled' },
      });
      expect(gateway.advance).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        action: CM_ACTIONS.REJECT_AND_CLOSE,
        notes: '[API · c] Duplicado',
        fields: {},
      });
      expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
    });

    it('asignado sin empezar: vuelve a asignación y rechaza', async () => {
      const { service, gateway, push } = build([
        order(10, 'Execution', { Assignee: 7 }),
      ]);

      const result = await service.cancel('corrective', 10, 'Duplicado', 'c');

      expect(result.data).toMatchObject({ status: 'Canceled' });
      expect(actionsOf(gateway.advance.mock.calls)).toEqual([
        BACK_ACTION,
        CM_ACTIONS.REJECT_AND_CLOSE,
      ]);
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledTimes(1);
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({ employeeId: 7, change: 'cancelled' }),
      );
    });

    it('si el rechazo falla tras volver a asignación: 502 «quedó por asignar sin cancelar»', async () => {
      const { service, gateway, push, store } = build([
        order(10, 'Execution', { Assignee: 7 }),
      ]);
      gateway.advance.mockImplementationOnce(
        (_s: string, id: number): Promise<unknown> => {
          store.get(id)!._ProcessStatus_code = CODES.Assignment;
          return Promise.resolve({});
        },
      );
      gateway.advance.mockRejectedValueOnce(upstream(500));

      const error = await failureOf(service.cancel('corrective', 10, 'x', 'c'));

      expect(error.message).toBe(
        'El correctivo quedó por asignar sin cancelar; repetir lo cancela',
      );
      expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
    });

    it('asignado sin la acción: 409; ya cancelado: unchanged; cerrado: 409', async () => {
      const { service } = build(
        [
          order(10, 'Execution', { Assignee: 7 }),
          order(11, 'Canceled'),
          order(12, 'Completed'),
        ],
        { back: null },
      );

      await expect(
        service.cancel('corrective', 10, 'x', 'c'),
      ).rejects.toMatchObject({
        status: 409,
      });
      expect(await service.cancel('corrective', 11, 'x', 'c')).toMatchObject({
        result: 'unchanged',
        warnings: ['closed'],
      });
      await expect(
        service.cancel('corrective', 12, 'x', 'c'),
      ).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('batch', () => {
    it('con dryRun valida sin escribir ni avisar', async () => {
      const { service, gateway, push } = build([
        order(10, 'Assignment'),
        order(11, 'Assignment', { Priority: null }),
      ]);

      const results = await service.batch(
        'corrective',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: 7 },
        ],
        true,
        'c',
      );

      expect(results).toEqual([
        { id: 10, result: 'valid', warnings: [], error: null },
        {
          id: 11,
          result: 'failed',
          warnings: [],
          error: { statusCode: 400, message: 'Faltan: priority' },
        },
        like({ id: 12, result: 'failed', error: like({ statusCode: 404 }) }),
      ]);
      expect(gateway.advance).not.toHaveBeenCalled();
      expect(gateway.saveFields).not.toHaveBeenCalled();
      expect(push.notifyCorrectiveAssigned).not.toHaveBeenCalled();
    });

    it('aplica cada cambio por separado', async () => {
      const { service, push } = build([
        order(10, 'Assignment'),
        order(11, 'Assignment'),
      ]);

      const results = await service.batch(
        'corrective',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 8 },
        ],
        false,
        'c',
      );

      expect(results.map((r) => r.result)).toEqual(['applied', 'applied']);
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledTimes(2);
    });
  });

  it('un fallo del aviso no cambia el resultado', async () => {
    const { service, push } = build([order(10, 'Assignment')]);
    push.notifyCorrectiveAssigned.mockRejectedValue(new Error('push caído'));

    const result = await service.update(
      'corrective',
      10,
      { employeeId: 7 },
      'c',
    );

    expect(result.result).toBe('applied');
  });

  it('un cambio sin diff no escribe ni avisa', async () => {
    const { service, gateway, push } = build([
      order(10, 'Execution', { Assignee: 7 }),
    ]);

    const result = await service.update(
      'corrective',
      10,
      { employeeId: 7 },
      'c',
    );

    expect(result.result).toBe('unchanged');
    expect(gateway.advance).not.toHaveBeenCalled();
    expect(push.notifyMaintenancePlanUpdated).not.toHaveBeenCalled();
  });
  describe('correcciones de la revisión', () => {
    it('en gestión, un técnico distinto avisa al nuevo y retira al anterior', async () => {
      const { service, push, gateway } = build([
        order(10, 'Management', { Assignee: 7 }),
      ]);

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 8 },
        'c',
      );

      expect(result.result).toBe('applied');
      expect(gateway.advance).not.toHaveBeenCalled();
      expect(push.notifyCorrectiveAssigned).toHaveBeenCalledWith(
        like({ assigneeId: 8 }),
      );
      expect(push.notifyMaintenancePlanUpdated).toHaveBeenCalledWith(
        like({ employeeId: 7, change: 'removed' }),
      );
    });

    it('un guardado de prioridad que falla en Assignment sin técnico es 502', async () => {
      const { service, gateway } = build([order(10, 'Assignment')]);
      gateway.saveFields.mockRejectedValueOnce(upstream(500));

      const error = await failureOf(
        service.update('corrective', 10, { priority: 'Low' }, 'c'),
      );

      expect(error).toMatchObject({ status: 502 });
    });

    it('si la fuente descarta la fecha al despachar: planned_start_not_saved', async () => {
      const { service } = build([order(10, 'Assignment')], {
        discard: ['ExpExecStartDate'],
      });

      const result = await service.update(
        'corrective',
        10,
        { employeeId: 7, plannedStartTime: OTHER },
        'c',
      );

      expect(result.warnings).toEqual(['planned_start_not_saved']);
    });

    it('reprogramar sin cambiar de técnico con uno que ya no es válido: 409 propio', async () => {
      const { service, gateway } = build([
        order(10, 'Execution', { Assignee: 99 }),
      ]);

      const error = await failureOf(
        service.update('corrective', 10, { plannedStartTime: OTHER }, 'c'),
      );

      expect(error).toMatchObject({ status: 409 });
      expect(error.message).toBe(
        'El técnico actual no es un técnico de mantenimiento o es un proveedor; reasignarlo antes de reprogramar',
      );
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('cambiar de equipo en asignación con el técnico puesto de otro equipo: 409', async () => {
      const { service, gateway } = build([
        order(10, 'Assignment', { Assignee: 7 }),
      ]);

      const error = await failureOf(
        service.update('corrective', 10, { teamId: 502 }, 'c'),
      );

      expect(error).toMatchObject({ status: 409 });
      expect(gateway.saveFields).not.toHaveBeenCalled();
    });

    it('un despacho sin confirmar avisa de que pudo quedar iniciado', async () => {
      const { service, gateway } = build([order(10, 'Assignment')]);
      const find = gateway.findWithTasklist.getMockImplementation()!;
      let reads = 0;
      gateway.findWithTasklist.mockImplementation((...args) =>
        ++reads === 1 ? find(...args) : Promise.reject(upstream(500)),
      );
      gateway.advance.mockRejectedValueOnce(upstream(504));

      const error = await failureOf(
        service.update('corrective', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toMatchObject({ status: 502 });
      expect(error.message).toContain('puede haber quedado iniciado');
    });

    it('un segundo paso de cancelación sin confirmar no afirma que quedó por asignar', async () => {
      const { service, gateway, store } = build([
        order(10, 'Execution', { Assignee: 7 }),
      ]);
      const find = gateway.findWithTasklist.getMockImplementation()!;
      let reads = 0;
      gateway.findWithTasklist.mockImplementation((...args) =>
        ++reads <= 2 ? find(...args) : Promise.reject(upstream(500)),
      );
      gateway.advance.mockImplementationOnce(
        (_s: string, id: number): Promise<unknown> => {
          store.get(id)!._ProcessStatus_code = CODES.Assignment;
          return Promise.resolve({});
        },
      );
      gateway.advance.mockRejectedValueOnce(upstream(504));

      const error = await failureOf(service.cancel('corrective', 10, 'x', 'c'));

      expect(error.message).toBe(
        'No se pudo confirmar el resultado; comprobar antes de repetir',
      );
    });
  });
});
