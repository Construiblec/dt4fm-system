import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  Logger,
  NotFoundException,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PM_ACTIONS } from '../preventive-maintenance/constants/preventive-maint.constants';
import { PreventiveFlow } from './flows/preventive-flow';
import { MaintenancePlanningService } from './maintenance-planning.service';

const CODES: Record<string, string> = {
  Planning: 'PM-Opening',
  Acceptance: 'PM-Assignment',
  Execution: 'PM-Execution',
  Suspension: 'PM-Suspension',
  Completed: 'PM-Completed',
  Canceled: 'PM-Canceled',
};
const STATUS_OF = Object.fromEntries(
  Object.entries(CODES).map(([name, code]) => [code, name]),
);

const START = '2026-11-26T15:00:00.000Z';
const TEAM = [
  { _id: 7, Description: 'Luis', Team: 501, _type: 'InternalEmployee' },
  { _id: 8, Description: 'Ana', Team: 501, _type: 'InternalEmployee' },
  { _id: 9, Description: 'Proveedor', Team: 501, _type: 'SupplierEmployee' },
];

type Card = Record<string, any> & { _id: number };

const order = (
  id: number,
  status: string,
  over: Record<string, unknown> = {},
): Card => ({
  _id: id,
  Number: `PM.2026.${id}`,
  ShortDescr: `Orden ${id}`,
  _ProcessStatus_code: CODES[status],
  _FlowStatus_code: 'open.running',
  Assignee: null,
  ExpExecStartDate: null,
  CISubset: 40,
  _CISubset_description: 'Bomba 1',
  _Site_description: 'Pradera',
  ...over,
});

const upstream = (status: number, message?: string) =>
  Object.assign(new Error(`fuente ${status}`), {
    response: {
      status,
      data: message ? { messages: [{ message }] } : undefined,
    },
  });

/** Fuente en memoria con las reglas de escritura de cada paso. */
const build = (cards: Card[]) => {
  const store = new Map(cards.map((card) => [card._id, { ...card }]));
  const statusOf = (card: Card) =>
    STATUS_OF[card._ProcessStatus_code as string];
  const withTask = (card: Card) => ({
    ...card,
    _tasklist: [{ _id: `act-${card._id}` }],
  });

  const gateway = {
    findWithTasklist: jest.fn((_s: string, id: number): Promise<unknown> => {
      const card = store.get(id);
      return card
        ? Promise.resolve({ data: withTask(card) })
        : Promise.reject(upstream(404));
    }),
    advance: jest.fn(
      (_s: string, id: number, o: Record<string, any>): Promise<unknown> => {
        const card = store.get(id)!;
        const status = statusOf(card);
        if (o.action === PM_ACTIONS.ASSIGN && status === 'Planning') {
          Object.assign(card, o.fields, {
            _ProcessStatus_code: CODES.Acceptance,
          });
        } else if (o.action === PM_ACTIONS.CANCEL && status === 'Planning') {
          Object.assign(card, {
            _ProcessStatus_code: CODES.Canceled,
            _FlowStatus_code: 'closed.aborted',
          });
        } else if (
          o.action === PM_ACTIONS.CHANGE_ASSIGNEE &&
          status === 'Suspension'
        ) {
          Object.assign(card, o.fields);
        }
        return Promise.resolve({});
      },
    ),
    saveFields: jest.fn(
      (_s: string, id: number, o: Record<string, any>): Promise<unknown> => {
        const card = store.get(id)!;
        const status = statusOf(card);
        // Como la fuente: lo que el paso no declara escribible se descarta.
        const writable =
          status === 'Acceptance'
            ? ['Assignee', 'ExpExecStartDate']
            : status === 'Execution'
              ? ['Assignee']
              : [];
        for (const [name, value] of Object.entries(o.fields)) {
          if (writable.includes(name)) card[name] = value;
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
  const config = { get: jest.fn((): string | undefined => '501') };
  const push = {
    notifyPreventiveAssigned: jest.fn(
      (): Promise<unknown> => Promise.resolve(),
    ),
  };
  const service = new MaintenancePlanningService(
    new PreventiveFlow(gateway as never),
    openmaint as never,
    session as never,
    config as never,
    push as never,
  );
  return { service, gateway, openmaint, session, config, push, store };
};

const failureOf = (promise: Promise<unknown>): Promise<Error> =>
  promise.then(
    () => {
      throw new Error('debía fallar');
    },
    (error: Error) => error,
  );

describe('MaintenancePlanningService (preventivos)', () => {
  let realNow: () => number;
  let offset: number;

  beforeEach(() => {
    realNow = Date.now.bind(Date) as () => number;
    offset = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('update', () => {
    it('asigna en planificación: avanza con la nota de auditoría y avisa una vez', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'agente-uno',
      );

      expect(result).toMatchObject({
        id: 10,
        result: 'applied',
        warnings: [],
        data: {
          kind: 'preventive',
          id: 10,
          status: 'Acceptance',
          assignee: { id: 7 },
        },
      });
      expect(gateway.advance).toHaveBeenCalledTimes(1);
      expect(gateway.advance).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        action: PM_ACTIONS.ASSIGN,
        notes: '[API · agente-uno] Asignación de técnico',
        fields: { Assignee: 7 },
      });
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledTimes(1);
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledWith({
        id: 10,
        assigneeId: 7,
        assetName: 'Bomba 1',
        buildingName: 'Pradera',
      });
    });

    it('las notas del cliente van en la nota del avance y el actor se sanea', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);

      await service.update(
        'preventive',
        10,
        { employeeId: 7, notes: 'Urgente' },
        'mal<script>\nnombre',
      );

      expect(
        (gateway.advance.mock.calls[0][2] as { notes: string }).notes,
      ).toBe('[API · malscriptnombre] Urgente');
    });

    it('un guardado no avisa ni deja nota, pero sí el log', async () => {
      const { service, gateway, push } = build([
        order(10, 'Acceptance', { Assignee: 8 }),
      ]);
      const log = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, plannedStartTime: START, notes: 'ignorada' },
        'cli',
      );

      expect(result.result).toBe('applied');
      expect(gateway.advance).not.toHaveBeenCalled();
      expect(gateway.saveFields).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        fields: { Assignee: 7, ExpExecStartDate: START },
      });
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Preventivo 10: planificación cambiada por cli',
        ),
      );
    });

    it('repetir el cambio da unchanged y no escribe ni avisa', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);
      await service.update('preventive', 10, { employeeId: 7 }, 'c');
      gateway.advance.mockClear();
      push.notifyPreventiveAssigned.mockClear();

      const again = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );

      expect(again.result).toBe('unchanged');
      expect(gateway.advance).not.toHaveBeenCalled();
      expect(gateway.saveFields).not.toHaveBeenCalled();
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
    });

    it('sin campos o solo con notas, 400 sin leer nada', async () => {
      const { service, gateway } = build([order(10, 'Acceptance')]);

      await expect(
        service.update('preventive', 10, {}, 'c'),
      ).rejects.toBeInstanceOf(BadRequestException);
      const error = await failureOf(
        service.update('preventive', 10, { notes: 'x' }, 'c'),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(
        'Las notas solo se registran junto con un cambio de técnico o una cancelación',
      );
      expect(gateway.findWithTasklist).not.toHaveBeenCalled();
    });

    it('notas con un cambio que no altera nada: unchanged con notes_not_saved', async () => {
      const { service, gateway } = build([
        order(10, 'Acceptance', { Assignee: 7 }),
      ]);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, notes: 'x' },
        'c',
      );

      expect(result).toMatchObject({
        result: 'unchanged',
        warnings: ['notes_not_saved'],
      });
      expect(gateway.saveFields).not.toHaveBeenCalled();
    });

    it('notas en un simple guardado: se aplica y avisa notes_not_saved', async () => {
      const { service, gateway } = build([
        order(10, 'Acceptance', { Assignee: 8 }),
      ]);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, notes: 'x' },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['notes_not_saved'],
      });
      expect(gateway.saveFields).toHaveBeenCalledTimes(1);
    });

    it('notas con un avance no avisan', async () => {
      const { service } = build([order(10, 'Planning')]);
      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, notes: 'x' },
        'c',
      );
      expect(result.warnings).toEqual([]);
    });

    describe('técnico actual fuera de los equipos de mantenimiento', () => {
      it('proveedor: 409 tras leer su ficha una sola vez', async () => {
        const { service, openmaint, gateway } = build([
          order(10, 'Acceptance', { Assignee: 20 }),
        ]);
        openmaint.readEmployeeCard.mockResolvedValue({
          data: { _id: 20, _type: 'SupplierEmployee' },
        });

        const error = await failureOf(
          service.update('preventive', 10, { employeeId: 7 }, 'c'),
        );

        expect(error).toBeInstanceOf(ConflictException);
        expect(openmaint.readEmployeeCard).toHaveBeenCalledTimes(1);
        expect(openmaint.readEmployeeCard).toHaveBeenCalledWith(20, 'sesion');
        expect(gateway.saveFields).not.toHaveBeenCalled();
      });

      it('no proveedor: reasigna', async () => {
        const { service, openmaint } = build([
          order(10, 'Acceptance', { Assignee: 20 }),
        ]);
        openmaint.readEmployeeCard.mockResolvedValue({
          data: { _id: 20, _type: 'InternalEmployee' },
        });

        const result = await service.update(
          'preventive',
          10,
          { employeeId: 7 },
          'c',
        );

        expect(result.result).toBe('applied');
      });

      it.each([
        ['falla la lectura', () => Promise.reject(upstream(500))],
        ['sin ficha', () => Promise.resolve({})],
        ['sin tipo', () => Promise.resolve({ data: { _id: 20 } })],
      ])('%s: 502 y nunca se permite', async (_case, answer) => {
        const { service, openmaint, gateway } = build([
          order(10, 'Acceptance', { Assignee: 20 }),
        ]);
        openmaint.readEmployeeCard.mockImplementation(answer);

        const error = await failureOf(
          service.update('preventive', 10, { employeeId: 7 }, 'c'),
        );

        expect(error).toBeInstanceOf(BadGatewayException);
        expect(error.message).toContain('comprobar antes de repetir');
        expect(gateway.saveFields).not.toHaveBeenCalled();
      });

      it('en un lote lee la ficha una vez por técnico', async () => {
        const { service, openmaint } = build([
          order(10, 'Acceptance', { Assignee: 20 }),
          order(11, 'Acceptance', { Assignee: 20 }),
        ]);
        openmaint.readEmployeeCard.mockResolvedValue({
          data: { _id: 20, _type: 'InternalEmployee' },
        });

        const results = await service.batch(
          'preventive',
          [
            { id: 10, employeeId: 7 },
            { id: 11, employeeId: 8 },
          ],
          false,
          'c',
        );

        expect(results.map(({ result }) => result)).toEqual([
          'applied',
          'applied',
        ]);
        expect(openmaint.readEmployeeCard).toHaveBeenCalledTimes(1);
      });

      it('si el actual está en la lista no lee la ficha', async () => {
        const { service, openmaint } = build([
          order(10, 'Acceptance', { Assignee: 8 }),
        ]);
        await service.update('preventive', 10, { employeeId: 7 }, 'c');
        expect(openmaint.readEmployeeCard).not.toHaveBeenCalled();
      });
    });

    it('una orden inexistente es 404', async () => {
      const { service } = build([]);
      const error = await failureOf(
        service.update('preventive', 99, { employeeId: 7 }, 'c'),
      );
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('técnico inexistente 400 y proveedor 409, sin escribir', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);

      expect(
        await failureOf(
          service.update('preventive', 10, { employeeId: 99 }, 'c'),
        ),
      ).toBeInstanceOf(BadRequestException);
      expect(
        await failureOf(
          service.update('preventive', 10, { employeeId: 9 }, 'c'),
        ),
      ).toBeInstanceOf(ConflictException);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('sin equipos configurados, 503 y no escribe', async () => {
      const { service, config, gateway } = build([order(10, 'Planning')]);
      config.get.mockReturnValue(undefined);
      expect(
        await failureOf(
          service.update('preventive', 10, { employeeId: 7 }, 'c'),
        ),
      ).toBeInstanceOf(ServiceUnavailableException);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('un estado que no admite el cambio es 409', async () => {
      const { service } = build([order(10, 'Completed', { Assignee: 8 })]);
      expect(
        await failureOf(
          service.update('preventive', 10, { employeeId: 7 }, 'c'),
        ),
      ).toBeInstanceOf(ConflictException);
    });

    it('en ejecución aplica y avisa started', async () => {
      const { service, push } = build([
        order(10, 'Execution', { Assignee: 8 }),
      ]);
      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );
      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['started'],
      });
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
    });

    it('en suspensión usa CHANGE_ASSIGNEE y sigue suspendido', async () => {
      const { service, gateway, store } = build([
        order(10, 'Suspension', { Assignee: 8 }),
      ]);
      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );
      expect(result.warnings).toEqual(['started']);
      expect(gateway.advance).toHaveBeenCalledWith(
        'sesion',
        10,
        expect.objectContaining({ action: PM_ACTIONS.CHANGE_ASSIGNEE }),
      );
      expect(store.get(10)).toMatchObject({
        Assignee: 7,
        _ProcessStatus_code: CODES.Suspension,
      });
    });
  });

  describe('cadena de dos pasos', () => {
    it('asigna y fija la fecha', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, plannedStartTime: START },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: [],
        data: { status: 'Acceptance', plannedStartTime: START },
      });
      expect(gateway.advance).toHaveBeenCalledTimes(1);
      expect(gateway.saveFields).toHaveBeenCalledTimes(1);
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledTimes(1);
    });

    it('si el segundo paso falla, queda aplicado con aviso y se avisó de la asignación', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);
      gateway.saveFields.mockRejectedValue(upstream(500));

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, plannedStartTime: START },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['planned_start_not_saved'],
        data: {
          status: 'Acceptance',
          assignee: { id: 7 },
          plannedStartTime: null,
        },
      });
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledTimes(1);
    });

    it('si la fuente descarta la fecha sin error, también es aviso', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);
      gateway.saveFields.mockResolvedValue({});

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, plannedStartTime: START },
        'c',
      );

      expect(result.warnings).toEqual(['planned_start_not_saved']);
    });

    it('no empieza con menos de 15 s de presupuesto y no escribe nada', async () => {
      const { service, gateway, openmaint } = build([order(10, 'Planning')]);
      openmaint.getEmployees.mockImplementation(() => {
        offset = 35_000;
        return Promise.resolve({ data: TEAM });
      });

      const error = await failureOf(
        service.update(
          'preventive',
          10,
          { employeeId: 7, plannedStartTime: START },
          'c',
        ),
      );

      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('un solo paso sí empieza con poco presupuesto', async () => {
      const { service, openmaint } = build([order(10, 'Planning')]);
      openmaint.getEmployees.mockImplementation(() => {
        offset = 35_000;
        return Promise.resolve({ data: TEAM });
      });

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );
      expect(result.result).toBe('applied');
    });

    it('una cadena empezada no se corta aunque el plazo se agote entre pasos', async () => {
      const { service, gateway, store } = build([order(10, 'Planning')]);
      const advance = gateway.advance.getMockImplementation()!;
      gateway.advance.mockImplementation((...args) => {
        offset = 60_000;
        return advance(...args);
      });

      const result = await service
        .update(
          'preventive',
          10,
          { employeeId: 7, plannedStartTime: START },
          'c',
        )
        .catch((e: Error) => e);

      // El plazo global de 45 s es del reloj real; con el reloj simulado la cadena termina.
      expect(result).toMatchObject({ result: 'applied', warnings: [] });
      expect(store.get(10)!.ExpExecStartDate).toBe(START);
    });
  });

  describe('confirmSaved', () => {
    it('si el avance falla pero el estado ya es el esperado, cuenta como aplicado', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);
      const advance = gateway.advance.getMockImplementation()!;
      gateway.advance.mockImplementation((...args) => {
        void advance(...args);
        return Promise.reject(upstream(504));
      });

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );

      expect(result.result).toBe('applied');
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledTimes(1);
    });

    it('si falla y no se guardó, es 502', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);
      gateway.advance.mockRejectedValue(upstream(500));

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
    });

    it('si falla y tampoco se puede releer, es 502 que pide comprobar', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);
      gateway.advance.mockRejectedValue(upstream(500));
      let reads = 0;
      const find = gateway.findWithTasklist.getMockImplementation()!;
      gateway.findWithTasklist.mockImplementation((...args) =>
        ++reads === 1 ? find(...args) : Promise.reject(upstream(500)),
      );

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(error.message).toContain('comprobar antes de repetir');
    });

    it('un avance aceptado que no avanza es 502', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);
      gateway.advance.mockResolvedValue({});

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
    });

    it('escritura sin error y relectura caída: 502, sin aviso al técnico y con warn', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const find = gateway.findWithTasklist.getMockImplementation()!;
      let reads = 0;
      gateway.findWithTasklist.mockImplementation((...args) =>
        ++reads === 1 ? find(...args) : Promise.reject(upstream(500)),
      );

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Preventivo 10: no se pudo confirmar la asignación al técnico 7; el aviso al técnico no se envió',
        ),
      );
    });

    it('fecha enviada sin error y relectura caída: planned_start_unconfirmed', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);
      const find = gateway.findWithTasklist.getMockImplementation()!;
      let reads = 0;
      gateway.findWithTasklist.mockImplementation((...args) =>
        ++reads <= 2 ? find(...args) : Promise.reject(upstream(500)),
      );

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7, plannedStartTime: START },
        'c',
      );

      expect(result).toMatchObject({
        result: 'applied',
        warnings: ['planned_start_unconfirmed'],
      });
    });

    it('un guardado descartado en silencio es 502 si es el único paso', async () => {
      const { service, gateway } = build([order(10, 'Acceptance')]);
      gateway.saveFields.mockResolvedValue({});

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
    });

    it('en enfriamiento de la sesión tras el fallo, 503', async () => {
      const { service, gateway, session } = build([order(10, 'Planning')]);
      gateway.advance.mockImplementation(() => {
        session.isCoolingDown.mockReturnValue(true);
        return Promise.reject(upstream(401));
      });

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(ServiceUnavailableException);
    });

    it('traduce los errores conocidos de la fuente', async () => {
      const first = build([order(10, 'Planning')]);
      first.gateway.advance.mockRejectedValue(
        upstream(400, 'card not existing or user not authorized'),
      );
      expect(
        await failureOf(
          first.service.update('preventive', 10, { employeeId: 7 }, 'c'),
        ),
      ).toBeInstanceOf(NotFoundException);

      const second = build([order(10, 'Planning')]);
      second.gateway.advance.mockRejectedValue(
        upstream(500, 'task not found for instanceId 5'),
      );
      expect(
        await failureOf(
          second.service.update('preventive', 10, { employeeId: 7 }, 'c'),
        ),
      ).toBeInstanceOf(ConflictException);
    });
  });

  describe('sesión', () => {
    it('con un 401 renueva la sesión compartida y reintenta una vez', async () => {
      const { service, gateway, session } = build([order(10, 'Planning')]);
      const find = gateway.findWithTasklist.getMockImplementation()!;
      gateway.findWithTasklist.mockImplementationOnce(() =>
        Promise.reject(upstream(401)),
      );
      gateway.findWithTasklist.mockImplementation(find);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );

      expect(result.result).toBe('applied');
      expect(session.invalidateSession).toHaveBeenCalledTimes(1);
    });

    it('un segundo 401 no se reintenta más', async () => {
      const { service, gateway, session } = build([order(10, 'Planning')]);
      gateway.findWithTasklist.mockRejectedValue(upstream(401));

      const error = await failureOf(
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
      );

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(session.invalidateSession).toHaveBeenCalledTimes(1);
      expect(gateway.findWithTasklist).toHaveBeenCalledTimes(2);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('un 401 al escribir también renueva y reintenta una vez', async () => {
      const { service, gateway, session } = build([order(10, 'Planning')]);
      const advance = gateway.advance.getMockImplementation()!;
      gateway.advance.mockImplementationOnce(() =>
        Promise.reject(upstream(401)),
      );
      gateway.advance.mockImplementation(advance);

      const result = await service.update(
        'preventive',
        10,
        { employeeId: 7 },
        'c',
      );

      expect(result.result).toBe('applied');
      expect(session.invalidateSession).toHaveBeenCalledTimes(1);
      expect(gateway.advance).toHaveBeenCalledTimes(2);
    });

    it('sin sesión o en enfriamiento, 503 sin llamar a la fuente', async () => {
      const { service, gateway, session } = build([order(10, 'Planning')]);
      session.isCoolingDown.mockReturnValue(true);
      expect(
        await failureOf(
          service.update('preventive', 10, { employeeId: 7 }, 'c'),
        ),
      ).toBeInstanceOf(ServiceUnavailableException);

      session.isCoolingDown.mockReturnValue(false);
      session.getSessionId.mockResolvedValue('');
      expect(
        await failureOf(service.cancel('preventive', 10, 'x', 'c')),
      ).toBeInstanceOf(ServiceUnavailableException);
      expect(gateway.findWithTasklist).not.toHaveBeenCalled();
    });
  });

  describe('exclusive', () => {
    it('dos cambios simultáneos sobre la misma orden van uno tras otro', async () => {
      const { service, gateway, store } = build([order(10, 'Planning')]);

      const [a, b] = await Promise.all([
        service.update('preventive', 10, { employeeId: 7 }, 'c'),
        service.update('preventive', 10, { employeeId: 8 }, 'c'),
      ]);

      expect(a.result).toBe('applied');
      expect(b.result).toBe('applied');
      // El segundo ya leyó la orden asignada: guarda en vez de avanzar.
      expect(gateway.advance).toHaveBeenCalledTimes(1);
      expect(gateway.saveFields).toHaveBeenCalledTimes(1);
      expect(store.get(10)!.Assignee).toBe(8);
    });
  });

  describe('cancel', () => {
    it('cancela en planificación con el motivo en la nota y sin avisar', async () => {
      const { service, gateway, push } = build([order(10, 'Planning')]);

      const result = await service.cancel(
        'preventive',
        10,
        ' Duplicado ',
        'cli',
      );

      expect(result).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled', isClosed: true },
      });
      expect(gateway.advance).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-10',
        action: PM_ACTIONS.CANCEL,
        notes: '[API · cli] Duplicado',
        fields: {},
      });
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
    });

    it('ya cancelado es unchanged y no escribe', async () => {
      const { service, gateway } = build([order(10, 'Canceled')]);
      const result = await service.cancel('preventive', 10, 'x', 'c');
      expect(result).toMatchObject({
        result: 'unchanged',
        warnings: ['closed'],
      });
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('en otro estado, 409; sin motivo, 400', async () => {
      const { service } = build([order(10, 'Acceptance')]);
      expect(
        await failureOf(service.cancel('preventive', 10, 'x', 'c')),
      ).toBeInstanceOf(ConflictException);
      expect(
        await failureOf(service.cancel('preventive', 10, '  ', 'c')),
      ).toBeInstanceOf(BadRequestException);
    });
  });

  describe('batch', () => {
    it('con dryRun no escribe ni avisa y marca valid / unchanged / failed', async () => {
      const { service, gateway, push } = build([
        order(10, 'Planning'),
        order(11, 'Acceptance', { Assignee: 7 }),
        order(12, 'Completed', { Assignee: 8 }),
      ]);

      const results = await service.batch(
        'preventive',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: 7 },
          { id: 13, employeeId: 7 },
        ],
        true,
        'c',
      );

      expect(results.map(({ id, result }) => [id, result])).toEqual([
        [10, 'valid'],
        [11, 'unchanged'],
        [12, 'failed'],
        [13, 'failed'],
      ]);
      expect(results[2].error).toMatchObject({ statusCode: 409 });
      expect(results[3].error).toMatchObject({ statusCode: 404 });
      expect(gateway.advance).not.toHaveBeenCalled();
      expect(gateway.saveFields).not.toHaveBeenCalled();
      expect(push.notifyPreventiveAssigned).not.toHaveBeenCalled();
    });

    it('aplica en orden, lee los técnicos una vez y avisa solo de lo asignado', async () => {
      const { service, openmaint, push, store } = build([
        order(10, 'Planning'),
        order(11, 'Acceptance', { Assignee: 8 }),
        order(12, 'Planning'),
      ]);

      const results = await service.batch(
        'preventive',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: 99 },
        ],
        false,
        'c',
      );

      expect(results.map(({ id, result }) => [id, result])).toEqual([
        [10, 'applied'],
        [11, 'applied'],
        [12, 'failed'],
      ]);
      expect(results[2].error).toMatchObject({ statusCode: 400 });
      expect(openmaint.getEmployees).toHaveBeenCalledTimes(1);
      expect(push.notifyPreventiveAssigned).toHaveBeenCalledTimes(1);
      expect(store.get(11)!.Assignee).toBe(7);
    });

    it('lo que se agota no se intenta: la cadena sin presupuesto queda not_attempted', async () => {
      const { service, openmaint, gateway } = build([
        order(10, 'Planning'),
        order(11, 'Acceptance'),
      ]);
      openmaint.getEmployees.mockImplementation(() => {
        offset = 35_000;
        return Promise.resolve({ data: TEAM });
      });

      const results = await service.batch(
        'preventive',
        [
          { id: 10, employeeId: 7, plannedStartTime: START },
          { id: 11, employeeId: 7 },
        ],
        false,
        'c',
      );

      expect(results.map(({ id, result }) => [id, result])).toEqual([
        [10, 'not_attempted'],
        [11, 'applied'],
      ]);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('agotado el plazo, nada empieza', async () => {
      const { service, openmaint, gateway } = build([
        order(10, 'Planning'),
        order(11, 'Planning'),
      ]);
      openmaint.getEmployees.mockImplementation(() => {
        offset = 50_000;
        return Promise.resolve({ data: TEAM });
      });

      const results = await service.batch(
        'preventive',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 8 },
        ],
        false,
        'c',
      );

      expect(results.map(({ result }) => result)).toEqual([
        'not_attempted',
        'not_attempted',
      ]);
      expect(gateway.advance).not.toHaveBeenCalled();
    });

    it('un id repetido es 400 antes de leer nada', async () => {
      const { service, gateway } = build([order(10, 'Planning')]);
      await expect(
        service.batch(
          'preventive',
          [
            { id: 10, employeeId: 7 },
            { id: 10, employeeId: 8 },
          ],
          false,
          'c',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.findWithTasklist).not.toHaveBeenCalled();
    });

    it('el fallo de un cambio no frena a los demás', async () => {
      const { service, gateway } = build([
        order(10, 'Planning'),
        order(11, 'Planning'),
      ]);
      const advance = gateway.advance.getMockImplementation()!;
      gateway.advance.mockImplementationOnce(() =>
        Promise.reject(upstream(500)),
      );
      gateway.advance.mockImplementation(advance);

      const results = await service.batch(
        'preventive',
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
        ],
        false,
        'c',
      );

      expect(results.map(({ result }) => result)).toEqual([
        'failed',
        'applied',
      ]);
      expect(results[0].error).toMatchObject({ statusCode: 502 });
    });
  });

  it('un aviso que falla no cambia el resultado', async () => {
    const { service, push } = build([order(10, 'Planning')]);
    push.notifyPreventiveAssigned.mockRejectedValue(new Error('push caído'));

    const result = await service.update(
      'preventive',
      10,
      { employeeId: 7 },
      'c',
    );

    expect(result.result).toBe('applied');
  });

  it('los correctivos aún no tienen escritura', async () => {
    const { service } = build([]);
    await expect(
      service.update('corrective', 1, { employeeId: 7 }, 'c'),
    ).rejects.toBeInstanceOf(NotImplementedException);
  });
});
