import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { PM_ACTIONS } from '../src/modules/preventive-maintenance/constants/preventive-maint.constants';
import { MaintenanceStore, upstreamError } from './helpers/maintenance-store';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { MOCK_SESSION_ID } from './mocks/openmaint-core.mock';

const API = '/integrations/v1/preventives';
const READ_KEY = 'e2e-clave-mantenimiento-0123456789abcd';

/** Un cliente por bloque: el cupo de escritura es de 20/min. */
const writeKey = (client: string) =>
  `e2e-escritura-${client}-0123456789abcdefghij`;

const START = '2026-11-26T15:00:00.000Z';
const LOCAL_START = '2026-11-26T10:00:00-05:00';

describe('API de preventivos: escritura (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let store: MaintenanceStore;
  let client = 'prev-acceso';
  let responses: Response[] = [];
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;
  let invalidateSession: jest.SpyInstance;

  const call = async (
    method: 'get' | 'patch' | 'post' | 'put' | 'delete',
    path: string,
    body?: unknown,
    key: string | null = writeKey(client),
  ): Promise<Response> => {
    const test = request(app.getHttpServer())[method](path);
    if (key !== null) void test.set('x-api-key', key);
    const res = await (body === undefined ? test : test.send(body as object));
    responses.push(res);
    return res;
  };

  const patch = (body: unknown, id: number | string) =>
    call('patch', `${API}/${id}`, body);
  const cancel = (body: unknown, id: number | string) =>
    call('post', `${API}/${id}/cancel`, body);
  const plans = (body: unknown) => call('post', `${API}/plans`, body);
  const read = (id: number) => call('get', `${API}/${id}`, undefined, READ_KEY);

  const gateway = () => mocks.preventiveOpenmaint;
  const noWrites = () => {
    expect(gateway().advance).not.toHaveBeenCalled();
    expect(gateway().saveFields).not.toHaveBeenCalled();
    expect(store.advances).toEqual([]);
    expect(store.saves).toEqual([]);
  };
  const noPush = () =>
    expect(mocks.pushDispatch.notifyPreventiveAssigned).not.toHaveBeenCalled();

  const put = (status: string, overrides: Record<string, unknown> = {}) =>
    store.preventive(status, {
      CISubset: 40,
      _CISubset_description: 'Bomba 1',
      ...overrides,
    });
  const useClient = (name: string) =>
    beforeEach(() => {
      client = name;
    });

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    const session = app.get(CleaningTasksSessionService);
    getSessionId = jest.spyOn(session, 'getSessionId');
    isCoolingDown = jest.spyOn(session, 'isCoolingDown');
    invalidateSession = jest.spyOn(session, 'invalidateSession');
  });

  beforeEach(() => {
    resetMockCalls();
    responses = [];
    getSessionId.mockReset().mockResolvedValue(MOCK_SESSION_ID);
    isCoolingDown.mockReset().mockReturnValue(false);
    invalidateSession.mockClear();

    store = new MaintenanceStore();
    store.employees = [
      { _id: 7, Description: 'Luis Pérez', Team: 501 },
      { _id: 8, Description: 'Ana Ruiz', Team: 502 },
      {
        _id: 9,
        Description: 'Proveedor SA',
        Team: 501,
        _type: 'SupplierEmployee',
      },
      { _id: 10, Description: 'De limpieza', Team: 999 },
    ];
    store.install(mocks);
  });

  // Ninguna respuesta nombra la fuente y toda ruta de la API es privada.
  afterEach(() => {
    for (const { body, text, headers } of responses) {
      expect(text).not.toMatch(/openmaint|cmdbuild/i);
      expect(JSON.stringify(body)).not.toMatch(/openmaint|cmdbuild/i);
      if (headers['cache-control'] !== undefined) {
        expect(headers['cache-control']).toBe('private, no-store');
      }
    }
    for (const method of Object.values(mocks.openmaintClient)) {
      expect(method).not.toHaveBeenCalled();
    }
    // Los correctivos siguen sin escritura.
    for (const method of ['advance', 'saveFields'] as const) {
      expect(mocks.correctiveOpenmaint[method]).not.toHaveBeenCalled();
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('acceso', () => {
    useClient('prev-acceso');

    const ROUTES = [
      ['patch', `${API}/7`, { employeeId: 7 }],
      ['post', `${API}/7/cancel`, { reason: 'x' }],
      ['post', `${API}/plans`, { changes: [{ id: 7, employeeId: 7 }] }],
    ] as const;

    it.each(ROUTES)('401 sin clave válida: %s %s', async (m, path, body) => {
      for (const key of [null, 'x'.repeat(40)]) {
        const res = await call(m, path, body, key);
        expect(res.status).toBe(401);
        expect(res.headers['cache-control']).toBe('private, no-store');
      }
      noWrites();
    });

    it.each(ROUTES)(
      '403 con clave de lectura: %s %s',
      async (m, path, body) => {
        expect((await call(m, path, body, READ_KEY)).status).toBe(403);
        noWrites();
      },
    );

    it('404 en las rutas de escritura que no existen', async () => {
      for (const [method, path] of [
        ['put', `${API}/7`],
        ['delete', `${API}/7`],
        ['post', API],
      ] as const) {
        expect((await call(method, path, { x: 1 })).status).toBe(404);
      }
      // `plans` solo es una ruta de POST: en PATCH cae en `:id` y no es un id.
      expect((await call('patch', `${API}/plans`, { x: 1 })).status).toBe(400);
      noWrites();
    });

    it('503 en enfriamiento o sin sesión, sin llamar a la fuente', async () => {
      const card = put('Planning');
      isCoolingDown.mockReturnValue(true);
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(503);
      expect((await cancel({ reason: 'x' }, card._id)).status).toBe(503);
      expect(
        (await plans({ changes: [{ id: card._id, employeeId: 7 }] })).status,
      ).toBe(503);

      isCoolingDown.mockReturnValue(false);
      getSessionId.mockResolvedValue('');
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(503);

      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
      noWrites();
    });
  });

  describe('PATCH', () => {
    useClient('prev-campos');

    it('asigna en planificación: avanza, anota al cliente y avisa al técnico', async () => {
      const card = put('Planning');

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          kind: 'preventive',
          id: card._id,
          status: 'Acceptance',
          assignee: { id: 7, name: 'Luis Pérez' },
        },
      });
      expect(store.advances).toEqual([
        {
          id: card._id,
          action: PM_ACTIONS.ASSIGN,
          notes: '[API · prev-campos] Asignación de técnico',
          fields: { Assignee: 7 },
        },
      ]);
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledWith({
        id: card._id,
        assigneeId: 7,
        assetName: 'Bomba 1',
        buildingName: 'Pradera',
      });
    });

    it('con fecha, asigna y luego fija el inicio; la nota del cliente va en el avance', async () => {
      const card = put('Planning');

      const res = await patch(
        { employeeId: 7, plannedStartTime: LOCAL_START, notes: ' Urgente ' },
        card._id,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: { status: 'Acceptance', plannedStartTime: START },
      });
      expect(store.advances[0].notes).toBe('[API · prev-campos] Urgente');
      expect(store.saves).toEqual([
        { id: card._id, fields: { ExpExecStartDate: START } },
      ]);
    });

    it('repetir el cambio da unchanged sin escribir ni avisar', async () => {
      const card = put('Planning');
      await patch({ employeeId: 7 }, card._id);
      resetMockCalls();
      store.advances.length = 0;

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ result: 'unchanged', warnings: [] });
      noWrites();
      noPush();
    });

    it('los cambios rechazados no llegan a la fuente', async () => {
      const card = put('Planning');

      expect((await patch({ employeeId: 7 }, card._id + 1000)).status).toBe(
        404,
      );
      expect((await patch({ employeeId: 99 }, card._id)).status).toBe(400);
      expect((await patch({ employeeId: 9 }, card._id)).status).toBe(409);
      expect((await patch({ employeeId: 10 }, card._id)).status).toBe(400);
      expect((await patch({ plannedStartTime: START }, card._id)).status).toBe(
        409,
      );

      noWrites();
      noPush();
    });

    it('rechaza formatos inválidos y la query, sin escribir', async () => {
      const card = put('Planning');

      expect(
        (await patch({ employeeId: 7 }, `${card._id}?dryRun=true`)).status,
      ).toBe(400);
      for (const body of [
        {},
        { employeeId: null },
        { notes: 'solo notas' },
        { employeeId: 7, teamId: 5 },
        { employeeId: 7, priority: 'High' },
        { employeeId: '7' },
      ]) {
        expect((await patch(body, card._id)).status).toBe(400);
      }

      noWrites();
      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
    });

    it('vacía la caché de lecturas', async () => {
      const card = put('Planning');
      expect((await read(card._id)).body.data.assignee).toBeNull();

      await patch({ employeeId: 7 }, card._id);

      expect((await read(card._id)).body.data.assignee).toMatchObject({
        id: 7,
      });
    });
  });

  describe('según el estado', () => {
    useClient('prev-estados');

    it('Acceptance: guarda técnico y fecha sin avisar', async () => {
      const card = put('Acceptance', { Assignee: 8 });

      const res = await patch(
        { employeeId: 7, plannedStartTime: START },
        card._id,
      );

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          status: 'Acceptance',
          assignee: { id: 7 },
          plannedStartTime: START,
        },
      });
      expect(store.advances).toEqual([]);
      expect(store.saves).toHaveLength(1);
      // El técnico nuevo recibe la orden aunque el cambio sea un guardado.
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('un guardado con notas avisa notes_not_saved', async () => {
      const card = put('Acceptance', { Assignee: 8 });

      const res = await patch({ employeeId: 7, notes: 'Nota' }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['notes_not_saved'],
      });
    });

    it('técnico actual fuera de los equipos: proveedor 409 e ilegible 502', async () => {
      const card = put('Acceptance', { Assignee: 20 });
      const read = mocks.openmaint.readEmployeeCard;

      read.mockResolvedValueOnce({
        data: { _id: 20, _type: 'SupplierEmployee' },
      });
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(409);

      read.mockRejectedValueOnce(upstreamError(500));
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(502);

      read.mockResolvedValueOnce({
        data: { _id: 20, _type: 'InternalEmployee' },
      });
      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(200);
      expect(store.saves).toHaveLength(1);
    });

    it('Execution: solo el técnico, con aviso started; la fecha es 409', async () => {
      const card = put('Execution', { Assignee: 8 });

      const ok = await patch({ employeeId: 7 }, card._id);
      expect(ok.body).toMatchObject({
        result: 'applied',
        warnings: ['started'],
        data: { status: 'Execution', assignee: { id: 7 } },
      });

      const date = await patch({ plannedStartTime: START }, card._id);
      expect(date.status).toBe(409);
      expect(store.saves).toHaveLength(1);
      // El técnico nuevo recibe la orden aunque el cambio sea un guardado.
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('Suspension: cambia el técnico con PM04-Return y sigue suspendido', async () => {
      const card = put('Suspension', { Assignee: 8 });

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['started'],
        data: { status: 'Suspension', assignee: { id: 7 } },
      });
      expect(store.advances).toEqual([
        expect.objectContaining({ action: PM_ACTIONS.CHANGE_ASSIGNEE }),
      ]);
      expect((await patch({ plannedStartTime: START }, card._id)).status).toBe(
        409,
      );
      // El técnico nuevo recibe la orden aunque el cambio sea un guardado.
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('Completed: 409 con cambios y unchanged con aviso closed sin ellos', async () => {
      const card = put('Completed', { Assignee: 8 });

      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(409);
      const same = await patch({ employeeId: 8 }, card._id);

      expect(same.body).toMatchObject({
        result: 'unchanged',
        warnings: ['closed'],
      });
      noWrites();
    });

    it('si falla la fecha tras asignar, queda aplicado con aviso', async () => {
      const card = put('Planning');
      mocks.preventiveOpenmaint.saveFields.mockRejectedValue(
        upstreamError(500),
      );

      const res = await patch(
        { employeeId: 7, plannedStartTime: START },
        card._id,
      );

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: ['planned_start_not_saved'],
        data: { status: 'Acceptance', assignee: { id: 7 } },
      });
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('con un 401 de la fuente renueva la sesión y reintenta una vez', async () => {
      const card = put('Acceptance', { Assignee: 8 });
      const find =
        mocks.preventiveOpenmaint.findWithTasklist.getMockImplementation();
      mocks.preventiveOpenmaint.findWithTasklist.mockImplementationOnce(() =>
        Promise.reject(upstreamError(401)),
      );
      mocks.preventiveOpenmaint.findWithTasklist.mockImplementation(find);

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
      expect(invalidateSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelar', () => {
    useClient('prev-cancelar');

    it('cancela en planificación con el motivo en la nota', async () => {
      const card = put('Planning');

      const res = await cancel({ reason: '  Duplicado ' }, card._id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'applied',
        data: { status: 'Canceled', isClosed: true },
      });
      expect(store.advances).toEqual([
        {
          id: card._id,
          action: PM_ACTIONS.CANCEL,
          notes: '[API · prev-cancelar] Duplicado',
          fields: {},
        },
      ]);
      noPush();

      const again = await cancel({ reason: 'Duplicado' }, card._id);
      expect(again.body).toMatchObject({
        result: 'unchanged',
        warnings: ['closed'],
      });
      expect(store.advances).toHaveLength(1);
    });

    it('en otro estado, 409; sin motivo o sin orden, 400 y 404', async () => {
      const accepted = put('Acceptance');
      const running = put('Execution');

      const res = await cancel({ reason: 'x' }, accepted._id);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'Solo se puede cancelar un preventivo en planificación',
      );
      expect((await cancel({ reason: 'x' }, running._id)).status).toBe(409);
      expect((await cancel({}, accepted._id)).status).toBe(400);
      expect((await cancel({ reason: 'x' }, 987654)).status).toBe(404);
      expect(
        (
          await call('post', `${API}/${accepted._id}/cancel?x=1`, {
            reason: 'x',
          })
        ).status,
      ).toBe(400);

      noWrites();
    });
  });

  describe('lotes', () => {
    useClient('prev-lotes');

    it('con dryRun valida sin escribir ni avisar', async () => {
      const planning = put('Planning');
      const accepted = put('Acceptance', { Assignee: 7 });
      const closed = put('Completed', { Assignee: 8 });

      const res = await plans({
        dryRun: true,
        changes: [
          { id: planning._id, employeeId: 7 },
          { id: accepted._id, employeeId: 7 },
          { id: closed._id, employeeId: 7 },
          { id: 987654, employeeId: 7 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(
        ['valid', 'unchanged', 'failed', 'failed'],
      );
      expect(res.body.results[2].error.statusCode).toBe(409);
      expect(res.body.results[3].error.statusCode).toBe(404);
      expect(res.body.summary).toEqual({
        applied: 0,
        unchanged: 1,
        valid: 1,
        failed: 2,
        not_attempted: 0,
      });
      noWrites();
      noPush();
    });

    it('aplica en orden y avisa a cada técnico nuevo', async () => {
      const planning = put('Planning');
      const accepted = put('Acceptance', { Assignee: 8 });
      const bad = put('Planning');

      const res = await plans({
        changes: [
          { id: planning._id, employeeId: 7, plannedStartTime: START },
          { id: accepted._id, employeeId: 7 },
          { id: bad._id, employeeId: 99 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(false);
      expect(res.body.results.map((r: { result: string }) => r.result)).toEqual(
        ['applied', 'applied', 'failed'],
      );
      expect(res.body.results[2].error.statusCode).toBe(400);
      expect(store.preventives.get(planning._id)).toMatchObject({
        Assignee: 7,
        ExpExecStartDate: START,
      });
      expect(store.preventives.get(accepted._id)!.Assignee).toBe(7);
      expect(store.preventives.get(bad._id)!.Assignee).toBeUndefined();
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        2,
      );
    });

    it('un error de formato en cualquiera es 400 y no guarda nada', async () => {
      const card = put('Planning');

      const res = await plans({
        changes: [
          { id: card._id, employeeId: 7 },
          { id: card._id + 1, employeeId: '7' },
        ],
      });

      expect(res.status).toBe(400);
      expect(gateway().findWithTasklist).not.toHaveBeenCalled();
      noWrites();
    });

    it('rechaza ids repetidos, más de 25 y la query', async () => {
      const card = put('Planning');
      const change = { id: card._id, employeeId: 7 };

      expect((await plans({ changes: [change, change] })).status).toBe(400);
      expect(
        (
          await plans({
            changes: Array.from({ length: 26 }, (_, i) => ({
              id: i + 1,
              employeeId: 7,
            })),
          })
        ).status,
      ).toBe(400);
      expect(
        (await call('post', `${API}/plans?dryRun=true`, { changes: [change] }))
          .status,
      ).toBe(400);

      noWrites();
    });

    it('con formato válido es 200 aunque fallen todos', async () => {
      const res = await plans({
        changes: [
          { id: 987654, employeeId: 7 },
          { id: 987655, employeeId: 7 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ failed: 2, applied: 0 });
    });
  });

  describe('fallos de la fuente', () => {
    useClient('prev-fallos');

    it('un avance que falla sin guardarse es 502 y no avisa', async () => {
      const card = put('Planning');
      mocks.preventiveOpenmaint.advance.mockRejectedValue(upstreamError(500));

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(502);
      expect(store.preventives.get(card._id)!.Assignee).toBeUndefined();
      noPush();
    });

    it('un avance que falla pero se guardó cuenta como aplicado', async () => {
      const card = put('Planning');
      const advance =
        mocks.preventiveOpenmaint.advance.getMockImplementation()!;
      mocks.preventiveOpenmaint.advance.mockImplementation((...args) => {
        void advance(...args);
        return Promise.reject(upstreamError(504));
      });

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
      expect(mocks.pushDispatch.notifyPreventiveAssigned).toHaveBeenCalledTimes(
        1,
      );
    });

    it('la actividad gastada es 409', async () => {
      const card = put('Planning');
      const find =
        mocks.preventiveOpenmaint.findWithTasklist.getMockImplementation()!;
      // Entre la lectura y el avance, otro cambió el flujo.
      mocks.preventiveOpenmaint.findWithTasklist.mockImplementationOnce(
        async (...args) => {
          const found = (await find(...args)) as {
            data: { _tasklist: { _id: string }[] };
          };
          found.data._tasklist = [{ _id: 'act-vieja' }];
          return found;
        },
      );
      mocks.preventiveOpenmaint.findWithTasklist.mockImplementation(find);

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(409);
    });

    it('un 401 persistente no se reintenta más de una vez', async () => {
      const card = put('Planning');
      mocks.preventiveOpenmaint.findWithTasklist.mockRejectedValue(
        upstreamError(401),
      );

      const res = await patch({ employeeId: 7 }, card._id);

      expect(res.status).toBe(502);
      expect(invalidateSession).toHaveBeenCalledTimes(1);
      expect(mocks.preventiveOpenmaint.findWithTasklist).toHaveBeenCalledTimes(
        2,
      );
      noWrites();
    });

    it('la caché se vacía también tras un error', async () => {
      const card = put('Planning');
      expect((await read(card._id)).body.data.assignee).toBeNull();
      const advance =
        mocks.preventiveOpenmaint.advance.getMockImplementation()!;
      mocks.preventiveOpenmaint.advance.mockImplementation((...args) => {
        void advance(...args);
        return Promise.reject(upstreamError(500));
      });
      // Falla también el releer: el estado queda sin confirmar.
      const find =
        mocks.preventiveOpenmaint.findWithTasklist.getMockImplementation()!;
      let reads = 0;
      mocks.preventiveOpenmaint.findWithTasklist.mockImplementation(
        (...args) =>
          ++reads === 1 ? find(...args) : Promise.reject(upstreamError(500)),
      );

      expect((await patch({ employeeId: 7 }, card._id)).status).toBe(502);

      expect((await read(card._id)).body.data.assignee).toMatchObject({
        id: 7,
      });
    });
  });
});
