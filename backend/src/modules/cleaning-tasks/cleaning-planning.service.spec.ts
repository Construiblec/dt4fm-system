import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CleaningPlanFields } from './cleaning-planning.types';
import { CleaningPlanningService } from './cleaning-planning.service';
import type { CleaningTaskCard } from './cleaning-tasks.openmaint.service';
import { PHASE_IDS } from './constants/phase.constants';

const NOW = Date.parse('2026-11-25T15:00:00Z');
const TEAM = [
  { _id: 5, Description: 'Luis' },
  { _id: 7, Description: 'Ana' },
];
const CHECKLISTS = [
  { id: 40, code: 'A', description: 'Aseo' },
  { id: 41, code: ' SUPERVISION ', description: 'Supervisión' },
  { id: 42, code: null, description: 'Sin código' },
];

type Card = Record<string, unknown> & { _id: number };

const task = (id: number, over: Record<string, unknown> = {}): Card => ({
  _id: id,
  _phase_description: 'Assigned',
  phase: PHASE_IDS.ASSIGNED,
  Description: `Limpieza ${id}`,
  Employee: 5,
  PlannedStartTime: '2026-11-26T14:00:00Z',
  PlannedEndTime: '2026-11-26T16:00:00Z',
  CleaningChecklist: 40,
  Unit: 9,
  Observations: ' Con cuidado ',
  CheckoutDate: '2026-11-26',
  ...over,
});
const running = (id: number, over: Record<string, unknown> = {}): Card =>
  task(id, {
    _phase_description: 'InExecution',
    phase: PHASE_IDS.IN_EXECUTION,
    PlannedStartTime: '2026-11-25T14:00:00Z',
    PlannedEndTime: '2026-11-25T16:00:00Z',
    ActualStartTime: '2026-11-25T14:30:00Z',
    ...over,
  });

const upstream = (status: number, data?: unknown) =>
  Object.assign(new Error(`OpenMAINT ${status} /classes/x`), {
    response: { status, data },
  });
const wrapped = () =>
  new InternalServerErrorException('Error al consultar OpenMAINT');

const build = (cards: Card[] = [task(10)]) => {
  const store = new Map(cards.map((card) => [card._id, { ...card }]));
  const phaseOf = (card: Card) => card._phase_description;
  const gateway = {
    getTaskByIdWithSession: jest.fn((id: number): Promise<unknown> => {
      const card = store.get(id);
      return card
        ? Promise.resolve({ data: { ...card } })
        : Promise.reject(upstream(404));
    }),
    updateCleaningTask: jest.fn(
      (id: number, body: Record<string, unknown>): Promise<unknown> => {
        Object.assign(store.get(id) ?? {}, body);
        return Promise.resolve({ data: store.get(id) });
      },
    ),
    listEmployees: jest.fn(
      (): Promise<unknown> => Promise.resolve({ data: TEAM }),
    ),
    listChecklistOptions: jest.fn(() => Promise.resolve(CHECKLISTS)),
    getUnitByIdWithSession: jest.fn(
      (id: number): Promise<unknown> =>
        Promise.resolve({ data: id === 9 || id === 12 ? { _id: id } : null }),
    ),
    getAllTasks: jest.fn(
      ({
        phase,
        limit,
        offset,
      }: {
        phase: string;
        limit: number;
        offset: number;
      }): Promise<unknown> =>
        Promise.resolve({
          data: [...store.values()]
            .filter((card) => phaseOf(card) === phase && card.Employee != null)
            .slice(offset, offset + limit),
        }),
    ),
  };
  const reader = {
    item: jest.fn((id: number): Promise<unknown> => Promise.resolve({ id })),
  };
  const supervisions = {
    cancelOpenForTask: jest.fn((): Promise<unknown> => Promise.resolve([])),
  };
  const session = {
    isCoolingDown: jest.fn().mockReturnValue(false),
    getSessionId: jest.fn().mockResolvedValue('sesion'),
  };
  const config = { get: jest.fn((): string | undefined => '2397132') };
  const notices = { record: jest.fn() };
  const service = new CleaningPlanningService(
    gateway as never,
    reader as never,
    supervisions as never,
    session as never,
    config as never,
    notices as never,
  );
  const bodies = () => gateway.updateCleaningTask.mock.calls;
  return {
    service,
    gateway,
    reader,
    supervisions,
    session,
    config,
    notices,
    store,
    bodies,
  };
};

const failureOf = (promise: Promise<unknown>): Promise<Error> =>
  promise.then(
    () => {
      throw new Error('debía fallar');
    },
    (e: Error) => e,
  );

const expectError = async (
  promise: Promise<unknown>,
  type: new (...args: never[]) => Error,
) => {
  const error = await failureOf(promise);
  expect(error).toBeInstanceOf(type);
  expect(error.message).not.toMatch(/openmaint|\/classes/i);
  return error;
};

describe('CleaningPlanningService', () => {
  let logs: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    logs = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    for (const level of ['error', 'warn', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation();
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('update: diferencias', () => {
    const same: CleaningPlanFields = {
      employeeId: 5,
      plannedStartTime: '2026-11-26T09:00:00.000-05:00',
      plannedEndTime: '2026-11-26T16:00:00.400Z',
      checklistId: 40,
      unitId: 9,
      observations: 'Con cuidado',
      checkoutDate: '2026-11-26',
      description: ' Limpieza 10 ',
    };

    it('todo igual => unchanged sin PUT, sin aviso y sin validar referencias', async () => {
      const { service, gateway, notices, reader } = build();

      await expect(service.update(10, same, 'app')).resolves.toEqual({
        id: 10,
        result: 'unchanged',
        warnings: [],
        data: { id: 10 },
      });
      expect(gateway.updateCleaningTask).not.toHaveBeenCalled();
      expect(gateway.listEmployees).not.toHaveBeenCalled();
      expect(gateway.listChecklistOptions).not.toHaveBeenCalled();
      expect(gateway.getUnitByIdWithSession).not.toHaveBeenCalled();
      expect(notices.record).not.toHaveBeenCalled();
      expect(logs).not.toHaveBeenCalled();
      expect(reader.item).toHaveBeenCalledWith(10);
    });

    it('manda solo lo que cambia', async () => {
      const { service, bodies } = build();

      const result = await service.update(
        10,
        { ...same, plannedEndTime: '2026-11-26T12:00:00-05:00' },
        'app',
      );

      expect(result.result).toBe('applied');
      expect(bodies()).toEqual([
        [10, { PlannedEndTime: '2026-11-26T17:00:00.000Z' }],
      ]);
    });

    it('todos los campos, con sus atributos', async () => {
      const { service, bodies, gateway } = build();

      await service.update(
        10,
        {
          employeeId: 7,
          plannedStartTime: '2026-11-27T14:00:00Z',
          plannedEndTime: '2026-11-27T15:00:00Z',
          checklistId: 42,
          unitId: 12,
          observations: ' nueva ',
          checkoutDate: '2026-11-27',
          description: ' Otra ',
        },
        'app',
      );

      expect(bodies()).toEqual([
        [
          10,
          {
            Employee: 7,
            PlannedStartTime: '2026-11-27T14:00:00.000Z',
            PlannedEndTime: '2026-11-27T15:00:00.000Z',
            CleaningChecklist: 42,
            Unit: 12,
            Observations: 'nueva',
            CheckoutDate: '2026-11-27',
            Description: 'Otra',
          },
        ],
      ]);
      expect(gateway.listEmployees).toHaveBeenCalledWith(2397132);
      expect(gateway.getUnitByIdWithSession).toHaveBeenCalledWith(12);
    });

    it('null borra; undefined no toca', async () => {
      const { service, bodies, gateway } = build();

      await service.update(
        10,
        {
          employeeId: null,
          plannedStartTime: null,
          plannedEndTime: null,
          checklistId: null,
          unitId: null,
          observations: null,
          description: undefined,
        },
        'app',
      );

      expect(bodies()).toEqual([
        [
          10,
          {
            Employee: null,
            PlannedStartTime: null,
            PlannedEndTime: null,
            CleaningChecklist: null,
            Unit: null,
            Observations: null,
          },
        ],
      ]);
      // Borrar no necesita validar contra nada.
      expect(gateway.listEmployees).not.toHaveBeenCalled();
    });

    it('null sobre lo que ya está vacío (null, ausente o texto en blanco) => unchanged', async () => {
      const { service, bodies } = build([
        task(10, {
          Employee: null,
          PlannedStartTime: undefined,
          PlannedEndTime: null,
          CleaningChecklist: undefined,
          Unit: null,
          Observations: '   ',
        }),
      ]);

      const { result } = await service.update(
        10,
        {
          employeeId: null,
          plannedStartTime: null,
          plannedEndTime: null,
          checklistId: null,
          unitId: null,
          observations: '',
        },
        'app',
      );

      expect(result).toBe('unchanged');
      expect(bodies()).toEqual([]);
    });

    it('la fecha de salida con hora cuenta por su día', async () => {
      const { service, bodies } = build([
        task(10, { CheckoutDate: '2026-11-26T00:00:00Z' }),
      ]);
      const same = { checkoutDate: '2026-11-26' };
      expect((await service.update(10, same, 'app')).result).toBe('unchanged');

      await service.update(10, { checkoutDate: '2026-11-27' }, 'app');
      expect(bodies()).toEqual([[10, { CheckoutDate: '2026-11-27' }]]);
    });

    it('sin fecha de salida guardada, se escribe', async () => {
      const { service, bodies } = build([task(10, { CheckoutDate: null })]);
      await service.update(10, { checkoutDate: '2026-11-27' }, 'app');
      expect(bodies()).toHaveLength(1);
    });

    it('los ids en texto equivalen a los numéricos', async () => {
      const { service, gateway } = build([
        task(10, { Employee: '5', Unit: '9', CleaningChecklist: '40' }),
      ]);
      const same = { employeeId: 5, unitId: 9, checklistId: 40 };
      expect((await service.update(10, same, 'app')).result).toBe('unchanged');

      gateway.listEmployees.mockResolvedValue({ data: [{ _id: '7' }] });
      const { result } = await service.update(10, { employeeId: 7 }, 'app');
      expect(result).toBe('applied');
    });

    it('repetir la misma petición no vuelve a escribir ni avisar', async () => {
      const { service, bodies, notices } = build();
      const fields = {
        employeeId: 7,
        plannedStartTime: '2026-11-26T13:30:00.500Z',
      };

      const first = await service.update(10, fields, 'app');
      const second = await service.update(10, fields, 'app');

      expect([first.result, second.result]).toEqual(['applied', 'unchanged']);
      expect(bodies()).toHaveLength(1);
      expect(notices.record).toHaveBeenCalledTimes(1);
    });

    it.each([{}, { employeeId: undefined }])(
      'sin ningún campo (%j) => 400 sin leer',
      async (fields) => {
        const { service, gateway } = build();

        await expectError(
          service.update(10, fields, 'app'),
          BadRequestException,
        );
        expect(gateway.getTaskByIdWithSession).not.toHaveBeenCalled();
      },
    );

    it.each(['', '   ', null as unknown as string])(
      'descripción vacía (%j) => 400',
      async (description) => {
        await expectError(
          build().service.update(10, { description }, 'app'),
          BadRequestException,
        );
      },
    );

    it('fecha que no se entiende => 400', async () => {
      const { service, bodies } = build();
      await expectError(
        service.update(10, { plannedStartTime: 'mañana' }, 'app'),
        BadRequestException,
      );
      expect(bodies()).toEqual([]);
    });
  });

  describe('update: inicio y fin', () => {
    it.each([
      { plannedStartTime: '2026-11-26T16:00:00Z' },
      { plannedEndTime: '2026-11-26T14:00:00Z' },
      { plannedEndTime: '2026-11-26T13:00:00Z' },
    ])('%j contra lo guardado => 400 sin PUT', async (fields) => {
      const { service, bodies } = build();
      await expectError(service.update(10, fields, 'app'), BadRequestException);
      expect(bodies()).toEqual([]);
    });

    it('cambiar los dos a un rango válido se acepta aunque cada uno choque con lo guardado', async () => {
      const { service } = build();
      const { result } = await service.update(
        10,
        {
          plannedStartTime: '2026-11-26T18:00:00Z',
          plannedEndTime: '2026-11-26T19:00:00Z',
        },
        'app',
      );
      expect(result).toBe('applied');
    });

    it('borrar uno deja de comparar', async () => {
      const { service, bodies } = build();
      await service.update(
        10,
        { plannedStartTime: '2026-11-27T00:00:00Z', plannedEndTime: null },
        'app',
      );
      expect(bodies()).toHaveLength(1);
    });

    it('un horario guardado ya inconsistente no impide cambiar otro campo', async () => {
      const { service, bodies } = build([
        task(10, { PlannedEndTime: '2026-11-26T13:00:00Z' }),
      ]);
      const { warnings } = await service.update(
        10,
        { observations: 'x', plannedEndTime: '2026-11-26T13:00:00Z' },
        'app',
      );
      expect(bodies()).toEqual([[10, { Observations: 'x' }]]);
      expect(warnings).toEqual([{ code: 'no_schedule' }]);
    });
  });

  describe('update: referencias', () => {
    it('operario de otro equipo => 400', async () => {
      const { service, bodies } = build();
      const error = await expectError(
        service.update(10, { employeeId: 99 }, 'app'),
        BadRequestException,
      );
      expect(error.message).toBe(
        'El operario no pertenece al equipo de limpieza',
      );
      expect(bodies()).toEqual([]);
    });

    it('el operario que ya tenía no se valida', async () => {
      const { service, gateway } = build([task(10, { Employee: 99 })]);
      await service.update(10, { employeeId: 99, observations: 'x' }, 'app');
      expect(gateway.listEmployees).not.toHaveBeenCalled();
    });

    it.each([undefined, '', 'abc', '0', '-3', '1.5'])(
      'equipo sin configurar (%j) => 503 solo si hace falta',
      async (value) => {
        const { service, config, gateway, bodies } = build();
        config.get.mockReturnValue(value);

        await expectError(
          service.update(10, { employeeId: 7 }, 'app'),
          ServiceUnavailableException,
        );
        expect(gateway.listEmployees).not.toHaveBeenCalled();
        expect(bodies()).toEqual([]);

        const { result } = await service.update(
          10,
          { employeeId: null },
          'app',
        );
        expect(result).toBe('applied');
      },
    );

    it.each([41, 999])('checklist %d => 400', async (checklistId) => {
      const { service, bodies } = build();
      await expectError(
        service.update(10, { checklistId }, 'app'),
        BadRequestException,
      );
      expect(bodies()).toEqual([]);
    });

    it('unidad inexistente => 400; ilegible => 502', async () => {
      const { service, gateway } = build();
      await expectError(
        service.update(10, { unitId: 77 }, 'app'),
        BadRequestException,
      );
      gateway.getUnitByIdWithSession.mockRejectedValueOnce(wrapped());
      await expectError(
        service.update(10, { unitId: 12 }, 'app'),
        BadGatewayException,
      );
    });

    it.each(['listEmployees', 'listChecklistOptions'] as const)(
      '%s falla => 502 sin PUT',
      async (method) => {
        const { service, gateway, bodies } = build();
        gateway[method].mockRejectedValue(wrapped());
        await expectError(
          service.update(10, { employeeId: 7, checklistId: 42 }, 'app'),
          BadGatewayException,
        );
        expect(bodies()).toEqual([]);
      },
    );

    it('equipo sin listado => 502, no «fuera del equipo»', async () => {
      const { service, gateway } = build();
      gateway.listEmployees.mockResolvedValue({});
      await expectError(
        service.update(10, { employeeId: 7 }, 'app'),
        BadGatewayException,
      );
    });
  });

  describe('update: errores', () => {
    it.each([404, 400])('la fuente responde %d => 404', async (status) => {
      const { service, gateway } = build();
      gateway.getTaskByIdWithSession.mockRejectedValue(upstream(status));
      const error = await expectError(
        service.update(10, { observations: 'x' }, 'app'),
        NotFoundException,
      );
      expect(error.message).toBe('Limpieza 10 no encontrada');
    });

    it('respuesta sin tarjeta => 404', async () => {
      const { service, gateway } = build();
      gateway.getTaskByIdWithSession.mockResolvedValue({ data: null });
      await expectError(
        service.update(10, { observations: 'x' }, 'app'),
        NotFoundException,
      );
    });

    it.each([
      upstream(404, ' <html>'),
      upstream(500),
      upstream(401),
      new Error('ECONNRESET'),
    ])('lectura: %s => 502', async (cause) => {
      const { service, gateway } = build();
      gateway.getTaskByIdWithSession.mockRejectedValue(cause);
      await expectError(
        service.update(10, { observations: 'x' }, 'app'),
        BadGatewayException,
      );
    });

    it('fallo al escribir => 502 sin aviso ni registro de cambio', async () => {
      const { service, gateway, notices } = build();
      gateway.updateCleaningTask.mockRejectedValue(wrapped());
      const error = await expectError(
        service.update(10, { employeeId: 7 }, 'app'),
        BadGatewayException,
      );
      expect(error.message).toMatch(/comprobar antes de repetir/);
      expect(notices.record).not.toHaveBeenCalled();
      expect(logs).not.toHaveBeenCalled();
    });

    describe('la respuesta de la escritura se pierde', () => {
      const fields = {
        employeeId: 7,
        plannedEndTime: '2026-11-26T17:00:00.250Z',
        observations: ' nueva ',
      };
      /** Guarda (o no) y responde con un fallo. */
      const losing = (
        save: (card: Card, body: Record<string, unknown>) => void,
      ) => {
        const built = build();
        built.gateway.updateCleaningTask.mockImplementation((id, body) => {
          save(built.store.get(id)!, body);
          return Promise.reject(wrapped());
        });
        return built;
      };

      it('pero se guardó => applied, con aviso y registro; repetir da unchanged', async () => {
        const { service, notices, bodies } = losing((card, body) =>
          // Como responde la fuente: sin milisegundos y con ids de texto.
          Object.assign(card, body, {
            Employee: '7',
            PlannedEndTime: '2026-11-26T17:00:00Z',
          }),
        );

        const first = await service.update(10, fields, 'app');
        const second = await service.update(10, fields, 'app');

        expect([first.result, second.result]).toEqual(['applied', 'unchanged']);
        expect(notices.record).toHaveBeenCalledTimes(1);
        expect(logs).toHaveBeenCalledTimes(1);
        expect(bodies()).toHaveLength(1);
      });

      it('no importa que otro cambiara un campo ajeno a lo escrito', async () => {
        const { service } = losing((card, body) =>
          Object.assign(card, body, { Unit: 12 }),
        );
        await expect(
          service.update(10, { ...fields, unitId: 9 }, 'app'),
        ).resolves.toMatchObject({ result: 'applied' });
      });

      it.each([
        ['nada', () => {}],
        ['solo una parte', (card: Card) => void (card.Employee = 7)],
      ])('se guardó %s => 502 sin aviso', async (_, save) => {
        const { service, notices } = losing(save);
        await expectError(
          service.update(10, fields, 'app'),
          BadGatewayException,
        );
        expect(notices.record).not.toHaveBeenCalled();
      });

      it('no se puede releer, o no responde en 8 s => 502', async () => {
        const { service, gateway } = build();
        gateway.updateCleaningTask.mockRejectedValue(wrapped());
        gateway.getTaskByIdWithSession
          .mockResolvedValueOnce({ data: task(10) })
          .mockRejectedValueOnce(upstream(500))
          .mockResolvedValueOnce({ data: task(10) })
          .mockReturnValueOnce(new Promise(() => {}));
        await expectError(
          service.update(10, fields, 'app'),
          BadGatewayException,
        );
        const hung = failureOf(service.update(10, fields, 'app'));
        await jest.advanceTimersByTimeAsync(8_000);
        expect(await hung).toBeInstanceOf(BadGatewayException);
      });

      it('en enfriamiento no se relee => 503', async () => {
        const { service, gateway, session } = build();
        gateway.updateCleaningTask.mockImplementation(() => {
          session.isCoolingDown.mockReturnValue(true);
          return Promise.reject(wrapped());
        });
        await expectError(
          service.update(10, fields, 'app'),
          ServiceUnavailableException,
        );
        expect(gateway.getTaskByIdWithSession).toHaveBeenCalledTimes(1);
      });

      it('en un lote también cuenta como applied', async () => {
        const { service, notices } = losing((card, body) =>
          Object.assign(card, body),
        );
        const [result] = await service.batch([{ id: 10, ...fields }], {
          dryRun: false,
          actor: 'app',
        });
        expect(result).toMatchObject({ result: 'applied', error: null });
        expect(notices.record).toHaveBeenCalledTimes(1);
      });

      it('al cancelar: quedó cancelada => applied con aviso', async () => {
        const { service, notices, supervisions } = losing((card) =>
          Object.assign(card, { _phase_description: 'Cancelled' }),
        );
        await expect(service.cancel(10, 'm', 'app')).resolves.toMatchObject({
          result: 'applied',
        });
        expect(notices.record).toHaveBeenCalledTimes(1);
        expect(supervisions.cancelOpenForTask).toHaveBeenCalledWith(10);
      });

      it('al cancelar: sigue abierta => 502 sin aviso', async () => {
        const { service, notices, supervisions } = losing(() => {});
        await expectError(service.cancel(10, 'm', 'app'), BadGatewayException);
        expect(notices.record).not.toHaveBeenCalled();
        expect(supervisions.cancelOpenForTask).not.toHaveBeenCalled();
      });
    });

    it('en enfriamiento => 503 sin pedir sesión ni leer', async () => {
      const { service, session, gateway } = build();
      session.isCoolingDown.mockReturnValue(true);
      const calls = [
        service.update(10, { observations: 'x' }, 'app'),
        service.cancel(10, 'm', 'app'),
        service.batch([{ id: 10, observations: 'x' }], {
          dryRun: false,
          actor: 'app',
        }),
        service.listCleaners('2026-11-25T05:00:00Z', '2026-11-27T05:00:00Z'),
        service.listChecklists(),
      ];
      for (const call of calls) {
        await expectError(call, ServiceUnavailableException);
      }
      expect(session.getSessionId).not.toHaveBeenCalled();
      expect(gateway.getTaskByIdWithSession).not.toHaveBeenCalled();
      expect(gateway.getAllTasks).not.toHaveBeenCalled();
    });

    it('sin sesión => 503', async () => {
      const { service, session, gateway } = build();
      session.getSessionId.mockResolvedValue('');
      await expectError(
        service.update(10, { observations: 'x' }, 'app'),
        ServiceUnavailableException,
      );
      expect(gateway.getTaskByIdWithSession).not.toHaveBeenCalled();
    });

    it('si al fallar quedó en enfriamiento => 503', async () => {
      const { service, session, gateway } = build();
      gateway.getTaskByIdWithSession.mockImplementation(() => {
        session.isCoolingDown.mockReturnValue(true);
        return Promise.reject(upstream(401));
      });
      await expectError(
        service.update(10, { observations: 'x' }, 'app'),
        ServiceUnavailableException,
      );
    });

    it('no se pudo releer => data null, no error', async () => {
      const { service, reader } = build();
      reader.item.mockRejectedValue(new BadGatewayException('x'));
      await expect(
        service.update(10, { observations: 'x' }, 'app'),
      ).resolves.toMatchObject({ result: 'applied', data: null });
    });

    it('la relectura se cuelga => data null', async () => {
      const { service, reader } = build();
      reader.item.mockReturnValue(new Promise(() => {}));
      const result = service.update(10, { observations: 'x' }, 'app');
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(result).resolves.toMatchObject({
        result: 'applied',
        data: null,
      });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('una lectura colgada => 502 a los 20 s', async () => {
      const { service, gateway } = build();
      gateway.getTaskByIdWithSession.mockReturnValue(new Promise(() => {}));
      const result = failureOf(service.update(10, { unitId: 12 }, 'app'));
      await jest.advanceTimersByTimeAsync(20_000);
      expect(await result).toBeInstanceOf(BadGatewayException);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('la escritura se cuelga => 504 a los 45 s avisando de que pudo guardarse', async () => {
      const { service, gateway, notices } = build();
      let saved: (value: unknown) => void = () => {};
      gateway.updateCleaningTask.mockReturnValue(
        new Promise((resolve) => (saved = resolve)),
      );
      const result = failureOf(service.update(10, { employeeId: 7 }, 'app'));
      await jest.advanceTimersByTimeAsync(45_000);
      const error = await result;
      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect(error.message).toMatch(/puede haberse guardado/);

      // Si al final se guardó, el operario se entera igual.
      saved({});
      await jest.advanceTimersByTimeAsync(0);
      expect(notices.record).toHaveBeenCalledTimes(1);
    });

    it('pasado el plazo no empieza a escribir', async () => {
      const { service, session, bodies, gateway } = build();
      let ready: (value: unknown) => void = () => {};
      session.getSessionId.mockReturnValue(
        new Promise((resolve) => (ready = resolve)),
      );
      const result = failureOf(service.update(10, { employeeId: 7 }, 'app'));
      await jest.advanceTimersByTimeAsync(45_000);
      expect(await result).toBeInstanceOf(GatewayTimeoutException);
      ready('sesion');
      await jest.advanceTimersByTimeAsync(0);
      expect(gateway.getTaskByIdWithSession).not.toHaveBeenCalled();
      expect(bodies()).toEqual([]);
    });
  });

  describe('warnings', () => {
    const codes = async (cards: Card[], fields: CleaningPlanFields) =>
      (await build(cards).service.update(10, fields, 'app')).warnings.map(
        ({ code }) => code,
      );
    const note = { observations: 'x' };

    it.each(['Completed', 'Reviewed', 'Cancelled'])(
      '%s => closed, se guarda, sin leer la agenda ni avisar',
      async (phase) => {
        const { service, gateway, notices, bodies } = build([
          task(10, { _phase_description: phase }),
        ]);
        const result = await service.update(10, { employeeId: 7 }, 'app');
        expect(result).toMatchObject({
          result: 'applied',
          warnings: [{ code: 'closed' }],
        });
        expect(bodies()).toEqual([[10, { Employee: 7 }]]);
        expect(gateway.getAllTasks).not.toHaveBeenCalled();
        expect(notices.record).not.toHaveBeenCalled();
      },
    );

    it('la fase se entiende también por su id', async () => {
      const closed = task(10, {
        _phase_description: undefined,
        phase: PHASE_IDS.REVIEWED,
      });
      expect(await codes([closed], note)).toEqual(['closed']);
    });

    it('en ejecución, en pausa o reabierta => started', async () => {
      const paused = {
        TeamObservations: '[Pausado: 2026-11-25 | 10:20]: sin agua',
      };
      expect(await codes([running(10)], note)).toEqual(['started']);
      expect(await codes([task(10, paused)], note)).toEqual(['started']);
      expect(
        await codes(
          [
            task(10, {
              ...paused,
              _phase_description: undefined,
            }),
          ],
          note,
        ),
      ).toEqual(['started']);
      expect(
        await codes(
          [task(10, { ActualStartTime: '2026-11-25T14:00:00Z' })],
          note,
        ),
      ).toEqual(['started']);
    });

    it.each([{ plannedStartTime: null }, { plannedEndTime: null }])(
      'con operario y %j => no_schedule sin leer la agenda',
      async (fields) => {
        const { service, gateway } = build();
        const { warnings } = await service.update(10, fields, 'app');
        expect(warnings).toEqual([{ code: 'no_schedule' }]);
        expect(gateway.getAllTasks).not.toHaveBeenCalled();
      },
    );

    it('sin operario no hay no_schedule ni agenda', async () => {
      const { service, gateway } = build([task(10, { Employee: null })]);
      const { warnings } = await service.update(
        10,
        { plannedStartTime: null },
        'app',
      );
      expect(warnings).toEqual([]);
      expect(gateway.getAllTasks).not.toHaveBeenCalled();
    });

    it('unchanged también trae warnings', async () => {
      const { service } = build([running(10, { PlannedEndTime: null })]);
      await expect(
        service.update(10, { employeeId: 5 }, 'app'),
      ).resolves.toMatchObject({
        result: 'unchanged',
        warnings: [{ code: 'started' }, { code: 'no_schedule' }],
      });
    });

    it('overlap: las del mismo operario que se cruzan, por inicio', async () => {
      const { service, bodies } = build([
        task(10, { Employee: null }),
        task(22, { PlannedStartTime: '2026-11-26T15:30:00Z' }),
        task(21, {
          PlannedStartTime: '2026-11-26T13:00:00Z',
          PlannedEndTime: '2026-11-26T14:00:01Z',
        }),
        task(23, { Employee: 7 }),
        task(24, { PlannedEndTime: null }),
        task(25, { _phase_description: 'Completed' }),
      ]);

      const { warnings, result } = await service.update(
        10,
        { employeeId: 7 },
        'app',
      );
      expect(result).toBe('applied');
      expect(warnings).toEqual([
        {
          code: 'overlap',
          cleanings: [
            {
              id: 23,
              description: 'Limpieza 23',
              phase: 'Assigned',
              plannedStartTime: '2026-11-26T14:00:00Z',
              plannedEndTime: '2026-11-26T16:00:00Z',
            },
          ],
        },
      ]);
      expect(bodies()).toHaveLength(1);

      const other = await service.update(10, { employeeId: 5 }, 'app');
      expect(
        other.warnings.map(
          (w) => w.code === 'overlap' && w.cleanings.map(({ id }) => id),
        ),
      ).toEqual([[21, 22]]);
    });

    it('las contiguas no se cruzan', async () => {
      expect(
        await codes(
          [
            task(10),
            task(21, {
              PlannedStartTime: '2026-11-26T13:00:00Z',
              PlannedEndTime: '2026-11-26T14:00:00Z',
            }),
            task(22, {
              PlannedStartTime: '2026-11-26T16:00:00Z',
              PlannedEndTime: '2026-11-26T17:00:00Z',
            }),
          ],
          note,
        ),
      ).toEqual([]);
    });

    describe('la que está en ejecución ocupa desde su inicio real hasta su fin o ahora', () => {
      const at = (start: string, end: string) =>
        task(10, {
          PlannedStartTime: `2026-11-25T${start}:00Z`,
          PlannedEndTime: `2026-11-25T${end}:00Z`,
        });

      it('antes del inicio real no se cruza', async () => {
        expect(await codes([at('14:00', '14:30'), running(21)], note)).toEqual(
          [],
        );
      });

      it('hasta el fin planeado si aún no pasó', async () => {
        expect(await codes([at('15:59', '17:00'), running(21)], note)).toEqual([
          'overlap',
        ]);
        expect(await codes([at('16:00', '17:00'), running(21)], note)).toEqual(
          [],
        );
      });

      it('hasta ahora si va atrasada', async () => {
        const late = running(21, { PlannedEndTime: '2026-11-25T14:45:00Z' });
        expect(await codes([at('14:50', '17:00'), late], note)).toEqual([
          'overlap',
        ]);
        expect(await codes([at('15:00', '17:00'), late], note)).toEqual([]);
      });

      it('reabierta: cuenta desde su último arranque, no desde el primero', async () => {
        // La marca se escribe en la hora local del servidor.
        const local = new Date('2026-11-25T14:40:00Z');
        const two = (n: number) => String(n).padStart(2, '0');
        const mark = `${local.getFullYear()}-${two(local.getMonth() + 1)}-${two(local.getDate())} | ${two(local.getHours())}:${two(local.getMinutes())}`;
        const reopened = running(21, {
          ActualStartTime: '2026-11-20T14:00:00Z',
          ExecutionTime: 60,
          TeamObservations: `[Reiniciado: ${mark} | 60min]`,
        });
        expect(await codes([at('14:10', '14:40'), reopened], note)).toEqual([]);
        expect(await codes([at('14:10', '14:41'), reopened], note)).toEqual([
          'overlap',
        ]);
      });

      it('sin sesión conocida usa el mayor entre real y planeado', async () => {
        const unknown = running(21, {
          ActualStartTime: '2026-11-20T14:00:00Z',
          ExecutionTime: 60,
        });
        expect(await codes([at('13:00', '14:00'), unknown], note)).toEqual([]);
        expect(await codes([at('13:00', '14:01'), unknown], note)).toEqual([
          'overlap',
        ]);
        const later = { ...unknown, ActualStartTime: '2026-11-25T14:30:00Z' };
        expect(await codes([at('14:00', '14:30'), later], note)).toEqual([]);
      });

      it('con el inicio planeado en el futuro ocupa desde ahora', async () => {
        const early = running(21, {
          ActualStartTime: '2026-11-20T14:00:00Z',
          ExecutionTime: 60,
          PlannedStartTime: '2026-11-25T16:00:00Z',
          PlannedEndTime: '2026-11-25T17:00:00Z',
        });
        expect(await codes([at('15:10', '15:30'), early], note)).toEqual([
          'overlap',
        ]);
        expect(await codes([at('14:00', '15:00'), early], note)).toEqual([]);
      });

      it('sin horario planeado también ocupa; sin ningún inicio, no', async () => {
        const none = { PlannedStartTime: null, PlannedEndTime: null };
        expect(
          await codes([at('14:50', '17:00'), running(21, none)], note),
        ).toEqual(['overlap']);
        expect(
          await codes(
            [
              at('14:50', '17:00'),
              running(21, { ...none, ActualStartTime: null }),
            ],
            note,
          ),
        ).toEqual([]);
      });

      it('sin inicio real usa el planeado', async () => {
        expect(
          await codes(
            [at('14:00', '14:10'), running(21, { ActualStartTime: null })],
            note,
          ),
        ).toEqual(['overlap']);
      });
    });

    it('orden fijo: started antes que overlap', async () => {
      expect(
        await codes([running(10), running(21, { Employee: 5 })], note),
      ).toEqual(['started', 'overlap']);
    });

    it('agenda ilegible o sin listado => 502 sin escribir', async () => {
      for (const answer of [
        () => Promise.reject(wrapped()),
        () => Promise.resolve({}),
        () => Promise.resolve(null),
      ]) {
        const { service, gateway, bodies } = build();
        gateway.getAllTasks.mockImplementation(answer);
        await expectError(service.update(10, note, 'app'), BadGatewayException);
        expect(bodies()).toEqual([]);
      }
    });

    it('pagina hasta agotar y no repite limpiezas', async () => {
      const { service, gateway } = build();
      const overlapping = Array.from({ length: 200 }, (_, i) => task(100 + i));
      gateway.getAllTasks.mockImplementation(({ phase, offset }) =>
        Promise.resolve({
          data:
            phase !== 'Assigned'
              ? [running(299, { PlannedEndTime: '2026-11-26T15:00:00Z' })]
              : offset === 0
                ? overlapping
                : offset === 200
                  ? [task(299), task(300)]
                  : [],
        }),
      );

      const { warnings } = await service.update(10, note, 'app');

      expect(warnings).toHaveLength(1);
      const [warning] = warnings;
      const ids =
        warning.code === 'overlap' ? warning.cleanings.map((c) => c.id) : [];
      expect(ids).toHaveLength(201);
      expect(new Set(ids).size).toBe(201);
      expect(gateway.getAllTasks).toHaveBeenCalledTimes(3);
      expect(gateway.getAllTasks).toHaveBeenCalledWith({
        phase: 'Assigned',
        assigned: true,
        limit: 200,
        offset: 200,
        sort: 'newest',
      });
    });

    it('más de 2000 abiertas => 502', async () => {
      const { service, gateway } = build();
      gateway.getAllTasks.mockImplementation(({ offset }) =>
        Promise.resolve({
          data: Array.from({ length: 200 }, (_, i) => task(1000 + offset + i)),
        }),
      );
      await expectError(service.update(10, note, 'app'), BadGatewayException);
      expect(gateway.getAllTasks.mock.calls.length).toBeLessThanOrEqual(20);
    });
  });

  describe('avisos y registro', () => {
    it('cambia operario u horario => aviso con antes y después', async () => {
      const { service, notices } = build();
      await service.update(
        10,
        { employeeId: 7, plannedEndTime: '2026-11-26T17:00:00Z' },
        'app',
      );
      expect(notices.record.mock.calls).toEqual([
        [
          10,
          {
            employeeId: 5,
            plannedStartTime: '2026-11-26T14:00:00Z',
            plannedEndTime: '2026-11-26T16:00:00Z',
          },
          {
            employeeId: 7,
            plannedStartTime: '2026-11-26T14:00:00Z',
            plannedEndTime: '2026-11-26T17:00:00.000Z',
          },
        ],
      ]);
    });

    it('en ejecución también avisa', async () => {
      const { service, notices } = build([running(10)]);
      await service.update(10, { employeeId: null }, 'app');
      expect(notices.record).toHaveBeenCalledTimes(1);
    });

    it('texto, checklist, unidad o fecha de salida no avisan', async () => {
      const { service, notices } = build();
      await service.update(
        10,
        {
          observations: 'x',
          description: 'y',
          checklistId: null,
          unitId: 12,
          checkoutDate: '2026-11-30',
        },
        'app',
      );
      expect(notices.record).not.toHaveBeenCalled();
    });

    it('un fallo del aviso no tumba la operación', async () => {
      const { service, notices } = build();
      notices.record.mockImplementation(() => {
        throw new Error('pendiente');
      });
      await expect(
        service.update(10, { employeeId: 7 }, 'app'),
      ).resolves.toMatchObject({ result: 'applied' });
      await expect(service.cancel(10, 'm', 'app')).resolves.toMatchObject({
        result: 'applied',
      });
    });

    it('una línea por cambio, sin textos libres y con el actor saneado', async () => {
      const { service } = build();
      await service.update(
        10,
        {
          employeeId: 7,
          observations: 'clave 1234',
          description: 'Casa de Juan',
        },
        'app\nLimpieza 99: falsa',
      );
      expect(logs).toHaveBeenCalledTimes(1);
      const [[line]] = logs.mock.calls as [[string]];
      expect(line).not.toMatch(/\n|1234|Juan/);
      expect(line).toContain('cambiada por appLimpieza 99 falsa');
      expect(line).toContain('operario 5 → 7');
      expect(line).toContain('campos=employeeId,observations,description');
    });
  });

  describe('cancel', () => {
    it.each([task(10), running(10)])(
      'cancela y anula las supervisiones',
      async (card) => {
        const { service, bodies, supervisions, notices } = build([card]);

        const result = await service.cancel(10, '  ya no hace falta ', 'app');

        expect(result).toEqual({
          id: 10,
          result: 'applied',
          warnings: expect.arrayContaining([{ code: 'closed' }]) as unknown,
          data: { id: 10 },
        });
        expect(bodies()).toEqual([
          [10, { phase: PHASE_IDS.CANCELLED, Notes: 'ya no hace falta' }],
        ]);
        expect(supervisions.cancelOpenForTask).toHaveBeenCalledWith(10);
        const snapshot = {
          employeeId: 5,
          plannedStartTime: card.PlannedStartTime,
          plannedEndTime: card.PlannedEndTime,
        };
        expect(notices.record).toHaveBeenCalledWith(10, snapshot, {
          ...snapshot,
          cancelled: true,
        });
        expect((logs.mock.calls as [[string]])[0][0]).not.toContain('falta');
      },
    );

    it('ya cancelada => unchanged, sin escribir ni avisar', async () => {
      const { service, bodies, notices, supervisions } = build([
        task(10, {
          _phase_description: undefined,
          phase: PHASE_IDS.CANCELLED,
        }),
      ]);
      await expect(service.cancel(10, 'm', 'app')).resolves.toEqual({
        id: 10,
        result: 'unchanged',
        warnings: [{ code: 'closed' }],
        data: { id: 10 },
      });
      expect(bodies()).toEqual([]);
      expect(notices.record).not.toHaveBeenCalled();
      expect(supervisions.cancelOpenForTask).not.toHaveBeenCalled();
    });

    it.each(['Completed', 'Reviewed', 'Otra'])('%s => 409', async (phase) => {
      const { service, bodies } = build([
        task(10, { _phase_description: phase }),
      ]);
      await expectError(service.cancel(10, 'm', 'app'), ConflictException);
      expect(bodies()).toEqual([]);
    });

    it('motivo vacío => 400; inexistente => 404; fallo al escribir => 502', async () => {
      const { service, gateway } = build();
      await expectError(service.cancel(10, '  ', 'app'), BadRequestException);
      await expectError(service.cancel(11, 'm', 'app'), NotFoundException);
      gateway.updateCleaningTask.mockRejectedValue(wrapped());
      await expectError(service.cancel(10, 'm', 'app'), BadGatewayException);
    });

    it('las supervisiones fallan o se cuelgan => se cancela igual', async () => {
      const { service, supervisions } = build([task(10), task(11)]);
      supervisions.cancelOpenForTask.mockRejectedValueOnce(wrapped());
      await expect(service.cancel(10, 'm', 'app')).resolves.toMatchObject({
        result: 'applied',
      });
      supervisions.cancelOpenForTask.mockReturnValueOnce(new Promise(() => {}));
      const result = service.cancel(11, 'm', 'app');
      await jest.advanceTimersByTimeAsync(10_000);
      await expect(result).resolves.toMatchObject({ result: 'applied' });
    });
  });

  describe('escrituras simultáneas', () => {
    it('sobre la misma limpieza van una tras otra y gana la última', async () => {
      const { service, gateway, store } = build();
      const steps: string[] = [];
      const read = gateway.getTaskByIdWithSession.getMockImplementation();
      gateway.getTaskByIdWithSession.mockImplementation((id) => {
        steps.push('lee');
        return read!(id);
      });
      gateway.updateCleaningTask.mockImplementation(async (id, body) => {
        steps.push('escribe');
        await new Promise((resolve) => setTimeout(resolve, 100));
        Object.assign(store.get(id) ?? {}, body);
        steps.push('fin');
        return {};
      });

      const both = Promise.all([
        service.update(10, { employeeId: 7 }, 'a'),
        service.update(10, { employeeId: null }, 'b'),
      ]);
      await jest.advanceTimersByTimeAsync(200);
      await both;

      expect(steps).toEqual(['lee', 'escribe', 'fin', 'lee', 'escribe', 'fin']);
      expect(store.get(10)?.Employee).toBeNull();
    });

    it('un fallo no bloquea la siguiente, y otra limpieza no espera', async () => {
      const { service, gateway } = build([task(10), task(11)]);
      gateway.updateCleaningTask.mockRejectedValueOnce(wrapped());
      const first = failureOf(service.update(10, { employeeId: 7 }, 'a'));
      const second = service.update(10, { employeeId: null }, 'b');
      await first;
      await expect(second).resolves.toMatchObject({ result: 'applied' });

      gateway.updateCleaningTask.mockReturnValueOnce(new Promise(() => {}));
      const hung = failureOf(service.update(10, { employeeId: 7 }, 'a'));
      await jest.advanceTimersByTimeAsync(0);
      await expect(
        service.update(11, { employeeId: null }, 'b'),
      ).resolves.toMatchObject({ result: 'applied' });
      await jest.advanceTimersByTimeAsync(45_000);
      await hung;
    });
  });

  describe('batch', () => {
    const run = { dryRun: false, actor: 'app' };
    const dry = { dryRun: true, actor: 'app' };

    it('ids repetidos => 400 sin tocar nada', async () => {
      const { service, gateway } = build();
      await expectError(
        service.batch(
          [
            { id: 10, employeeId: 7 },
            { id: 10, observations: 'x' },
          ],
          run,
        ),
        BadRequestException,
      );
      expect(gateway.getTaskByIdWithSession).not.toHaveBeenCalled();
    });

    it('cada elemento con su resultado, en orden, y las lecturas comunes una vez', async () => {
      const { service, gateway, bodies, reader } = build([
        task(10),
        task(11, { PlannedStartTime: null }),
        task(12, { Employee: 7 }),
        task(13, { _phase_description: 'Completed' }),
      ]);

      const results = await service.batch(
        [
          { id: 10, employeeId: 99 },
          { id: 404, employeeId: 7 },
          { id: 11, employeeId: 7, checklistId: 42 },
          { id: 12, employeeId: 7 },
          { id: 13, checklistId: 41 },
          { id: 14 },
        ],
        run,
      );

      expect(results).toEqual([
        {
          id: 10,
          result: 'failed',
          warnings: [],
          error: {
            statusCode: 400,
            message: 'El operario no pertenece al equipo de limpieza',
          },
        },
        {
          id: 404,
          result: 'failed',
          warnings: [],
          error: { statusCode: 404, message: 'Limpieza 404 no encontrada' },
        },
        {
          id: 11,
          result: 'applied',
          warnings: [{ code: 'no_schedule' }],
          error: null,
        },
        { id: 12, result: 'unchanged', warnings: [], error: null },
        {
          id: 13,
          result: 'failed',
          warnings: [],
          error: {
            statusCode: 400,
            message: 'El checklist no existe o no se puede asignar',
          },
        },
        {
          id: 14,
          result: 'failed',
          warnings: [],
          error: { statusCode: 400, message: 'No hay nada que actualizar' },
        },
      ]);
      expect(bodies()).toEqual([[11, { Employee: 7, CleaningChecklist: 42 }]]);
      expect(gateway.listEmployees).toHaveBeenCalledTimes(1);
      expect(gateway.listChecklistOptions).toHaveBeenCalledTimes(1);
      expect(gateway.getAllTasks).toHaveBeenCalledTimes(2);
      expect(reader.item).not.toHaveBeenCalled();
    });

    it('los cruces se miran contra cómo queda el lote', async () => {
      const { service } = build([
        task(10, { Employee: null }),
        task(11, { Employee: null }),
        task(12, { Employee: 7 }),
      ]);

      // 12 deja libre a 7; 10 y 11 chocan entre sí.
      const results = await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: null },
        ],
        run,
      );

      const overlaps = results.map(({ warnings }) =>
        warnings.flatMap((w) =>
          w.code === 'overlap' ? w.cleanings.map((c) => c.id) : [],
        ),
      );
      expect(overlaps).toEqual([[11], [10], []]);
      expect(results.every(({ result }) => result === 'applied')).toBe(true);
    });

    it('lo inválido o no guardado no cuenta para los cruces', async () => {
      const { service, gateway } = build([
        task(10, { Employee: null }),
        task(11, { Employee: null }),
        task(12, { Employee: null }),
      ]);
      const write = gateway.updateCleaningTask.getMockImplementation()!;
      gateway.updateCleaningTask.mockImplementation((id, body) =>
        id === 11 ? Promise.reject(wrapped()) : write(id, body),
      );

      const results = await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: 7, checklistId: 999 },
        ],
        run,
      );

      expect(results.map(({ result }) => result)).toEqual([
        'applied',
        'failed',
        'failed',
      ]);
      expect(results[0].warnings).toEqual([]);
      expect(results[1].error).toMatchObject({ statusCode: 502 });
      expect(results[1].error?.message).not.toMatch(/openmaint/i);
    });

    it('si no se puede leer el equipo falla solo quien cambia de operario', async () => {
      const { service, gateway } = build([task(10), task(11)]);
      gateway.listEmployees.mockRejectedValue(wrapped());
      const results = await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, observations: 'x' },
        ],
        run,
      );
      expect(results.map((r) => r.error?.statusCode ?? r.result)).toEqual([
        502,
        'applied',
      ]);
    });

    it('sin equipo configurado => 503 solo en quien lo necesita', async () => {
      const { service, config } = build([task(10), task(11)]);
      config.get.mockReturnValue(undefined);
      const results = await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: null },
        ],
        run,
      );
      expect(results.map((r) => r.error?.statusCode ?? r.result)).toEqual([
        503,
        'applied',
      ]);
    });

    it('si no se puede leer la agenda falla solo quien la necesita, sin escribirse', async () => {
      const { service, gateway, bodies } = build([
        task(10),
        task(11, { Employee: null }),
      ]);
      gateway.getAllTasks.mockRejectedValue(wrapped());
      const results = await service.batch(
        [
          { id: 10, observations: 'x' },
          { id: 11, observations: 'x' },
        ],
        run,
      );
      expect(results.map((r) => r.error?.statusCode ?? r.result)).toEqual([
        502,
        'applied',
      ]);
      expect(bodies().map(([id]) => id)).toEqual([11]);
    });

    it('vuelve a leer justo antes de escribir', async () => {
      const { service, gateway, bodies } = build();
      let reads = 0;
      gateway.getTaskByIdWithSession.mockImplementation(() =>
        Promise.resolve({
          data: task(10, reads++ === 0 ? {} : { Employee: 7 }),
        }),
      );
      const [result] = await service.batch([{ id: 10, employeeId: 7 }], run);
      expect(result.result).toBe('unchanged');
      expect(bodies()).toEqual([]);
    });

    it('lee como mucho 5 a la vez y escribe en serie', async () => {
      const cards = Array.from({ length: 12 }, (_, i) =>
        task(10 + i, { Employee: null }),
      );
      const { service, gateway } = build(cards);
      const active = { read: 0, write: 0 };
      const max = { read: 0, write: 0 };
      const track = async (kind: 'read' | 'write') => {
        max[kind] = Math.max(max[kind], ++active[kind]);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active[kind]--;
      };
      gateway.getTaskByIdWithSession.mockImplementation(async (id) => {
        await track('read');
        return { data: cards.find((c) => c._id === id) };
      });
      gateway.updateCleaningTask.mockImplementation(() => track('write'));

      const results = service.batch(
        cards.map(({ _id }) => ({ id: _id, observations: 'x' })),
        run,
      );
      await jest.advanceTimersByTimeAsync(2_000);

      expect((await results).every((r) => r.result === 'applied')).toBe(true);
      expect(max).toEqual({ read: 5, write: 1 });
    });

    it('dryRun: valid, unchanged o failed, sin escribir ni avisar', async () => {
      const { service, gateway, bodies, notices } = build([
        task(10, { Employee: null }),
        task(11, { Employee: null }),
        task(12),
      ]);
      const results = await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, employeeId: 7 },
          { id: 12, employeeId: 5 },
          { id: 13, employeeId: 5 },
        ],
        dry,
      );
      expect(results.map(({ result }) => result)).toEqual([
        'valid',
        'valid',
        'unchanged',
        'failed',
      ]);
      expect(results[0].warnings).toMatchObject([
        { code: 'overlap', cleanings: [{ id: 11 }] },
      ]);
      expect(bodies()).toEqual([]);
      expect(notices.record).not.toHaveBeenCalled();
      expect(logs).not.toHaveBeenCalled();
      expect(gateway.getTaskByIdWithSession).toHaveBeenCalledTimes(4);
    });

    it('avisa una vez por cada cambio aplicado', async () => {
      const { service, notices } = build([task(10), task(11)]);
      await service.batch(
        [
          { id: 10, employeeId: 7 },
          { id: 11, observations: 'x' },
        ],
        run,
      );
      expect(notices.record).toHaveBeenCalledTimes(1);
      expect(logs).toHaveBeenCalledTimes(2);
    });

    it('a los 45 s no empieza cambios nuevos => not_attempted', async () => {
      const cards = [10, 11, 12, 13].map((id) => task(id, { Employee: null }));
      const { service, gateway, bodies, notices } = build(cards);
      gateway.updateCleaningTask.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 23_000)),
      );

      const pending = service.batch(
        cards.map(({ _id }) => ({ id: _id, employeeId: 7 })),
        run,
      );
      await jest.advanceTimersByTimeAsync(60_000);
      const results = await pending;

      expect(results.map(({ result }) => result)).toEqual([
        'applied',
        'applied',
        'not_attempted',
        'not_attempted',
      ]);
      expect(results[2]).toMatchObject({ warnings: [], error: null });
      // Solo se cruzan entre sí las dos que se guardaron.
      expect(results[0].warnings).toMatchObject([
        { code: 'overlap', cleanings: [{ id: 11 }] },
      ]);
      expect(bodies()).toHaveLength(2);
      expect(notices.record).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('lo que no se alcanzó a leer tampoco se intenta', async () => {
      const cards = Array.from({ length: 20 }, (_, i) => task(10 + i));
      const { service, gateway, bodies } = build(cards);
      gateway.getTaskByIdWithSession.mockReturnValue(new Promise(() => {}));

      const pending = service.batch(
        cards.map(({ _id }) => ({ id: _id, observations: 'x' })),
        run,
      );
      await jest.advanceTimersByTimeAsync(45_000);
      const results = await pending;

      expect(results.map((r) => r.error?.statusCode ?? r.result)).toEqual([
        ...Array<number>(10).fill(502),
        ...Array<string>(10).fill('not_attempted'),
      ]);
      expect(bodies()).toEqual([]);
    });
  });

  describe('listCleaners', () => {
    const from = '2026-11-25T05:00:00Z';
    const to = '2026-11-27T05:00:00Z';

    it('arma la agenda de cada operario del equipo', async () => {
      const { service } = build([
        // Recortada: solo cuenta la hora que cae en el rango.
        task(20, {
          PlannedStartTime: '2026-11-27T04:00:00Z',
          PlannedEndTime: '2026-11-27T07:00:00Z',
        }),
        task(21),
        running(22),
        task(23, { PlannedEndTime: null }),
        task(24, {
          PlannedStartTime: '2026-11-27T05:00:00Z',
          PlannedEndTime: '2026-11-27T06:00:00Z',
        }),
        task(25, {
          PlannedStartTime: '2026-11-25T04:00:00Z',
          PlannedEndTime: '2026-11-25T05:00:00Z',
        }),
        task(26, { Employee: 99 }),
        task(27, { Employee: null }),
        task(28, { _phase_description: 'Completed' }),
      ]);

      const agenda = await service.listCleaners(from, to);

      expect(agenda.map(({ id, name }) => [id, name])).toEqual([
        [7, 'Ana'],
        [5, 'Luis'],
      ]);
      expect(agenda[0]).toEqual({
        id: 7,
        name: 'Ana',
        inExecutionId: null,
        plannedMinutes: 0,
        cleanings: [],
        unscheduled: [],
      });
      const luis = agenda[1];
      expect(luis.inExecutionId).toBe(22);
      expect(luis.cleanings.map(({ id }) => id)).toEqual([22, 21, 20]);
      expect(luis.unscheduled.map(({ id }) => id)).toEqual([23]);
      expect(luis.plannedMinutes).toBe(120 + 120 + 60);
      expect(luis.cleanings[0]).toEqual({
        id: 22,
        description: 'Limpieza 22',
        phase: 'InExecution',
        plannedStartTime: '2026-11-25T14:00:00Z',
        plannedEndTime: '2026-11-25T16:00:00Z',
        isPaused: false,
        actualStartTime: '2026-11-25T14:30:00Z',
        checkoutDate: '2026-11-26',
        unitId: 9,
      });
    });

    it('la que está en ejecución sale aunque no caiga en el rango ni tenga horario', async () => {
      const { service } = build([
        running(22, { PlannedStartTime: null, PlannedEndTime: null }),
      ]);
      const agenda = await service.listCleaners(
        '2026-12-01T05:00:00Z',
        '2026-12-02T05:00:00Z',
      );
      expect(agenda[1]).toMatchObject({
        inExecutionId: 22,
        plannedMinutes: 0,
        cleanings: [{ id: 22 }],
        unscheduled: [],
      });
    });

    it('un horario imposible cuenta como sin horario', async () => {
      const { service } = build([
        task(22, { PlannedEndTime: '2026-11-26T13:00:00Z' }),
      ]);
      const agenda = await service.listCleaners(from, to);
      expect(agenda[1]).toMatchObject({
        cleanings: [],
        unscheduled: [{ id: 22 }],
      });
    });

    it.each([
      [to, from],
      [from, from],
      ['x', to],
    ])('rango inválido %s–%s => 400', async (a, b) => {
      await expectError(
        build().service.listCleaners(a, b),
        BadRequestException,
      );
    });

    it('sin equipo => 503; equipo o agenda ilegibles => 502', async () => {
      const { service, config, gateway } = build();
      config.get.mockReturnValueOnce(undefined);
      await expectError(
        service.listCleaners(from, to),
        ServiceUnavailableException,
      );
      gateway.listEmployees.mockResolvedValueOnce({});
      await expectError(service.listCleaners(from, to), BadGatewayException);
      gateway.getAllTasks.mockRejectedValueOnce(wrapped());
      await expectError(service.listCleaners(from, to), BadGatewayException);
    });

    it('plazo agotado => 504 sin hablar de guardar', async () => {
      const { service, session } = build();
      session.getSessionId.mockReturnValue(new Promise(() => {}));
      const result = failureOf(service.listCleaners(from, to));
      await jest.advanceTimersByTimeAsync(45_000);
      const error = await result;
      expect(error).toBeInstanceOf(GatewayTimeoutException);
      expect(error.message).not.toMatch(/guardado/);
    });
  });

  describe('listChecklists', () => {
    it('sin el de supervisión', async () => {
      const { service } = build();
      await expect(service.listChecklists()).resolves.toEqual([
        CHECKLISTS[0],
        CHECKLISTS[2],
      ]);
    });

    it('fallo => 502', async () => {
      const { service, gateway } = build();
      gateway.listChecklistOptions.mockRejectedValue(upstream(500));
      await expectError(service.listChecklists(), BadGatewayException);
    });
  });

  it('solo escribe campos de planificación (o la cancelación)', async () => {
    const { service, bodies } = build();
    const extra = {
      observations: 'x',
      phase: 'Completed',
      ActualStartTime: '2026-11-25T14:00:00Z',
    } as CleaningPlanFields & Partial<CleaningTaskCard>;
    await service.update(10, extra, 'app');
    expect(bodies()).toEqual([[10, { Observations: 'x' }]]);
  });
});
