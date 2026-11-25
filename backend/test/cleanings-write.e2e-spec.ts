import { INestApplication } from '@nestjs/common';
import request, { Response } from 'supertest';
import { CleaningNoticesService } from '../src/modules/cleaning-tasks/cleaning-notices.service';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { PHASE_IDS } from '../src/modules/cleaning-tasks/constants/phase.constants';
import { CleaningStore, upstreamError } from './helpers/cleaning-store';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { SUPERVISION_PHASE_IDS } from './mocks/gateways.mock';
import { MOCK_SESSION_ID, mockSession } from './mocks/openmaint-core.mock';

const API = '/integrations/v1';
const CLEANINGS = `${API}/cleanings`;
const READ_KEY = 'e2e-clave-listado-0123456789abcdefghij';

/** Un cliente por bloque: el cupo de escritura es de 20/min. */
const writeKey = (client: string) =>
  `e2e-escritura-${client}-0123456789abcdefghij`;

const ID = 5001;
const TEN = '2026-11-26T15:00:00Z';
const ELEVEN = '2026-11-26T16:00:00Z';
const NOON = '2026-11-26T17:00:00Z';

const until = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(condition()).toBe(true);
};

describe('API de limpiezas: escritura (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let notices: CleaningNoticesService;
  let store: CleaningStore;
  let client = 'acceso';
  let responses: Response[] = [];
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const call = async (
    method: 'get' | 'patch' | 'post' | 'put' | 'delete',
    path: string,
    body?: unknown,
    key: string | null = writeKey(client),
  ): Promise<Response> => {
    const test = request(app.getHttpServer())[method](path);
    if (key !== null) void test.set('x-api-key', key);
    if (typeof body === 'string') void test.type('json');
    const res = await (body === undefined ? test : test.send(body as object));
    responses.push(res);
    return res;
  };

  const patch = (body: unknown, id: number | string = ID) =>
    call('patch', `${CLEANINGS}/${id}`, body);
  const cancel = (body: unknown, id: number | string = ID) =>
    call('post', `${CLEANINGS}/${id}/cancel`, body);
  const plans = (body: unknown) => call('post', `${API}/plans`, body);
  const read = (path: string) => call('get', path, undefined, READ_KEY);

  const gateway = () => mocks.cleaningTasksOpenmaint;
  const writes = () => gateway().updateCleaningTask.mock.calls as unknown[][];

  /** Nada de la fuente, salvo la lista de métodos indicada. */
  const expectNoSourceCalls = () => {
    const called = [
      mocks.cleaningTasksOpenmaint,
      mocks.cleaningSupervisionsOpenmaint,
    ].flatMap((source) =>
      Object.entries(source as Record<string, jest.Mock>)
        .filter(([, fn]) => fn.mock.calls.length > 0)
        .map(([name]) => name),
    );
    expect(called).toEqual([]);
  };

  const withEnv = async (
    values: Record<string, string>,
    work: () => Promise<void>,
  ) => {
    const original = Object.fromEntries(
      Object.keys(values).map((name) => [name, process.env[name]]),
    );
    Object.assign(process.env, values);
    try {
      await work();
    } finally {
      Object.assign(process.env, original);
    }
  };

  const useClient = (name: string) =>
    beforeEach(() => {
      client = name;
    });

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    notices = app.get(CleaningNoticesService);
    const session = app.get(CleaningTasksSessionService);
    getSessionId = jest.spyOn(session, 'getSessionId');
    isCoolingDown = jest.spyOn(session, 'isCoolingDown');
  });

  beforeEach(async () => {
    // Lo que dejara pendiente el test anterior no cuenta en este.
    await notices.flush();
    resetMockCalls();
    responses = [];
    getSessionId.mockReset().mockResolvedValue(MOCK_SESSION_ID);
    isCoolingDown.mockReset().mockReturnValue(false);

    store = new CleaningStore();
    store.put(ID);
    store.attach(mocks.cleaningTasksOpenmaint);
    const supervisions = mocks.cleaningSupervisionsOpenmaint;
    supervisions.findByTask.mockReset().mockResolvedValue([]);
    supervisions.findRecent.mockReset().mockResolvedValue([]);
    supervisions.updateSupervision.mockReset().mockResolvedValue(null);
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
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('acceso', () => {
    useClient('acceso');

    const ROUTES = [
      ['patch', `${CLEANINGS}/${ID}`, { observations: 'x' }],
      ['post', `${CLEANINGS}/${ID}/cancel`, { reason: 'x' }],
      ['post', `${API}/plans`, { changes: [{ id: ID, observations: 'x' }] }],
    ] as const;

    it.each(ROUTES)(
      '401 sin clave válida: %s %s',
      async (method, path, body) => {
        for (const key of [null, '', 'x'.repeat(40)]) {
          const res = await call(method, path, body, key);
          expect(res.status).toBe(401);
          expect(res.headers['cache-control']).toBe('private, no-store');
        }
        expectNoSourceCalls();
      },
    );

    it.each(ROUTES)(
      '403 con clave de lectura: %s %s, aunque el cuerpo sea inválido',
      async (method, path, body) => {
        expect((await call(method, path, body, READ_KEY)).status).toBe(403);
        expect((await call(method, path, { x: 1 }, READ_KEY)).status).toBe(403);
        expectNoSourceCalls();
      },
    );

    it('la clave de escritura también lee', async () => {
      for (const path of [
        CLEANINGS,
        `${CLEANINGS}/${ID}`,
        `${API}/cleaners`,
        `${API}/checklists`,
        `${API}/cleaning-sync`,
      ]) {
        expect((await call('get', path)).status).toBe(200);
      }
    });

    it.each([
      ['sin configurar', ''],
      ['con una clave corta', 'acceso:corta'],
      ['con una entrada inválida', `acceso:${writeKey('acceso')},sinclave`],
      ['con una clave también de lectura', `acceso:${READ_KEY}`],
    ])('503 %s, y la lectura sigue', async (_case, configured) => {
      await withEnv({ CLEANINGS_WRITE_API_KEYS: configured }, async () => {
        const res = await patch({ observations: 'x' });
        expect(res.status).toBe(503);
        const other = await call(
          'post',
          `${API}/plans`,
          { changes: [] },
          READ_KEY,
        );
        expect(other.status).toBe(503);
        expect(writes()).toEqual([]);
        expect((await read(`${CLEANINGS}/${ID}`)).status).toBe(200);
      });
    });

    it('la lista de lectura mal configurada no cierra la escritura', async () => {
      await withEnv({ CLEANINGS_API_KEYS: 'mal' }, async () => {
        expect((await patch({ observations: 'x' })).status).toBe(200);
      });
    });

    it('404 en las rutas de escritura que no existen', async () => {
      for (const [method, path] of [
        ['put', `${CLEANINGS}/${ID}`],
        ['delete', `${CLEANINGS}/${ID}`],
        ['post', CLEANINGS],
        ['patch', `${API}/plans`],
      ] as const) {
        expect((await call(method, path, { x: 1 })).status).toBe(404);
      }
      expectNoSourceCalls();
    });

    it('503 en enfriamiento o sin sesión, sin llamar a la fuente', async () => {
      isCoolingDown.mockReturnValue(true);
      expect((await patch({ observations: 'x' })).status).toBe(503);
      expect((await cancel({ reason: 'x' })).status).toBe(503);
      const changes = [{ id: ID, observations: 'x' }];
      expect((await plans({ changes })).status).toBe(503);

      isCoolingDown.mockReturnValue(false);
      getSessionId.mockResolvedValue('');
      expect((await patch({ observations: 'x' })).status).toBe(503);

      expectNoSourceCalls();
    });
  });

  describe('cuerpos rechazados con la app completa', () => {
    afterEach(() => {
      for (const { status } of responses) expect(status).toBe(400);
      expect(writes()).toEqual([]);
    });

    describe('campos', () => {
      useClient('campos');

      it.each([
        ['sin campos', {}],
        ['un campo desconocido', { observations: 'x', prioridad: 1 }],
        ['la fase', { phase: 'Completed' }],
        ['la fase con un campo válido', { observations: 'x', phase: 2216396 }],
        ['el inicio real', { actualStartTime: TEN }],
        ['el fin real', { actualEndTime: TEN }],
        ['la duración real', { executionTime: 60 }],
        ['las notas', { notes: 'x' }],
        ['el nombre interno de un campo', { Employee: 7001 }],
        ['el id en el cuerpo', { id: ID, observations: 'x' }],
        ['una lista', [{ observations: 'x' }]],
        ['null', 'null'],
        ['JSON roto', '{"observations":'],
        ['__proto__', '{"observations":"x","__proto__":{"phase":1}}'],
        ['constructor', '{"observations":"x","constructor":{"a":1}}'],
      ])('%s', async (_case, body) => {
        await patch(body);
        expect(responses).toHaveLength(1);
        expectNoSourceCalls();
      });

      it('texto plano', async () => {
        responses.push(
          await request(app.getHttpServer())
            .patch(`${CLEANINGS}/${ID}`)
            .set('x-api-key', writeKey(client))
            .type('text/plain')
            .send('{"observations":"x"}'),
        );
        expectNoSourceCalls();
      });

      it('un parámetro de consulta', async () => {
        await patch({ observations: 'x' }, `${ID}?dryRun=true`);
        expectNoSourceCalls();
      });

      it.each(['0', 'abc', '1e2'])('el id %s', async (id) => {
        await patch({ observations: 'x' }, id);
        expectNoSourceCalls();
      });
    });

    describe('valores', () => {
      useClient('valores');

      it.each([
        ['operario como texto', { employeeId: '7001' }],
        ['operario 0', { employeeId: 0 }],
        ['operario con decimales', { employeeId: 7001.5 }],
        ['checklist negativo', { checklistId: -1 }],
        ['unidad booleana', { unitId: true }],
        ['inicio sin zona', { plannedStartTime: '2026-11-26T10:00:00' }],
        ['inicio vacío', { plannedStartTime: '' }],
        [
          'inicio en día inexistente',
          { plannedStartTime: '2026-02-31T10:00Z' },
        ],
        ['fin anterior', { plannedStartTime: ELEVEN, plannedEndTime: TEN }],
        ['fin igual', { plannedStartTime: TEN, plannedEndTime: TEN }],
        ['indicaciones largas', { observations: 'x'.repeat(501) }],
        ['indicaciones numéricas', { observations: 5 }],
        ['salida inexistente', { checkoutDate: '2026-02-31' }],
        ['salida null', { checkoutDate: null }],
        ['descripción null', { description: null }],
        ['descripción en blanco', { description: '   ' }],
        ['descripción larga', { description: 'x'.repeat(201) }],
      ])('%s', async (_case, body) => {
        await patch(body);
        expectNoSourceCalls();
      });

      it('fin anterior al inicio ya guardado', async () => {
        Object.assign(store.get(ID), { PlannedStartTime: ELEVEN });
        await patch({ plannedEndTime: TEN });
      });

      it('inicio posterior al fin ya guardado', async () => {
        Object.assign(store.get(ID), { PlannedEndTime: TEN });
        await patch({ plannedStartTime: ELEVEN });
      });
    });

    describe('lotes', () => {
      useClient('lotes');

      const ok = { id: ID, observations: 'x' };

      it.each([
        ['sin cambios', {}],
        ['lista vacía', { changes: [] }],
        [
          '26 cambios',
          {
            changes: Array.from({ length: 26 }, (_, i) => ({
              id: 6000 + i,
              observations: 'x',
            })),
          },
        ],
        ['ids repetidos', { changes: [ok, { id: 6001, unitId: 1 }, ok] }],
        ['dryRun como texto', { dryRun: 'true', changes: [ok] }],
        ['dryRun null', { dryRun: null, changes: [ok] }],
        ['campo desconocido', { changes: [ok], modo: 'x' }],
        ['campo desconocido en un cambio', { changes: [{ ...ok, x: 1 }] }],
        ['fase en un cambio', { changes: [{ ...ok, phase: 'Completed' }] }],
        [
          'tiempo real en un cambio',
          { changes: [{ ...ok, actualEndTime: TEN }] },
        ],
        ['cambio sin campos', { changes: [{ id: ID }] }],
        ['cambio sin id', { changes: [{ observations: 'x' }] }],
        ['id como texto', { changes: [{ ...ok, id: '5001' }] }],
        ['cambio null', { changes: [null] }],
        ['cambio como lista', { changes: [[ok]] }],
        ['lista como objeto', { changes: { 0: ok } }],
      ])('%s', async (_case, body) => {
        await plans(body);
        expectNoSourceCalls();
      });

      it('?dryRun=true en la URL: no se escribe de verdad', async () => {
        await call('post', `${API}/plans?dryRun=true`, { changes: [ok] });
        expectNoSourceCalls();
      });
    });

    describe('motivos', () => {
      useClient('motivos');

      it.each([
        ['sin motivo', {}],
        ['vacío', { reason: '' }],
        ['en blanco', { reason: '   ' }],
        ['largo', { reason: 'x'.repeat(501) }],
        ['numérico', { reason: 5 }],
        ['con un campo de más', { reason: 'x', phase: 'Completed' }],
      ])('%s', async (_case, body) => {
        await cancel(body);
        expectNoSourceCalls();
      });

      it('un parámetro de consulta o un id inválido', async () => {
        await call('post', `${CLEANINGS}/${ID}/cancel?force=1`, {
          reason: 'x',
        });
        await cancel({ reason: 'x' }, 'abc');
        expectNoSourceCalls();
      });
    });
  });

  describe('PATCH de una limpieza', () => {
    useClient('cambios');

    it('guarda todos los campos en UTC y devuelve la limpieza actualizada', async () => {
      const res = await patch({
        employeeId: 7001,
        plannedStartTime: '2026-11-26T10:00:00-05:00',
        plannedEndTime: '2026-11-26T11:00:00-05:00',
        checklistId: 9100,
        unitId: 300,
        observations: '  Avisar a recepción ',
        checkoutDate: '2026-11-27',
        description: ' Limpieza - Apto 310 ',
      });

      expect(res.status).toBe(200);
      expect(writes()).toEqual([
        [
          ID,
          {
            Employee: 7001,
            PlannedStartTime: '2026-11-26T15:00:00.000Z',
            PlannedEndTime: '2026-11-26T16:00:00.000Z',
            CleaningChecklist: 9100,
            Unit: 300,
            Observations: 'Avisar a recepción',
            CheckoutDate: '2026-11-27',
            Description: 'Limpieza - Apto 310',
          },
        ],
      ]);
      expect(Object.keys(res.body as object).sort()).toEqual([
        'data',
        'result',
        'warnings',
      ]);
      expect(res.body).toMatchObject({
        result: 'applied',
        warnings: [],
        data: {
          id: ID,
          phase: 'Assigned',
          description: 'Limpieza - Apto 310',
          employee: { id: 7001, name: 'Ana Ruiz' },
          checklist: { id: 9100 },
          unitId: 300,
          checkoutDate: '2026-11-27',
          taskObservations: 'Avisar a recepción',
        },
      });
    });

    it('null borra', async () => {
      store.put(ID, {
        Employee: 7001,
        PlannedStartTime: TEN,
        PlannedEndTime: ELEVEN,
        CleaningChecklist: 9100,
        Unit: 300,
        Observations: 'algo',
      });

      const res = await patch({
        employeeId: null,
        plannedStartTime: null,
        plannedEndTime: null,
        checklistId: null,
        unitId: null,
        observations: null,
      });

      expect(res.body.result).toBe('applied');
      expect(writes()).toEqual([
        [
          ID,
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
      expect(res.body.data).toMatchObject({
        employee: null,
        plannedStartTime: null,
        plannedEndTime: null,
        checklist: null,
        unit: null,
        taskObservations: null,
      });
    });

    it('lo ausente no se toca', async () => {
      store.put(ID, {
        Employee: 7001,
        PlannedStartTime: TEN,
        PlannedEndTime: ELEVEN,
        Unit: 300,
        Observations: 'algo',
      });

      await patch({ checklistId: 9101 });

      expect(writes()).toEqual([[ID, { CleaningChecklist: 9101 }]]);
      expect(store.get(ID)).toMatchObject({
        Employee: 7001,
        PlannedStartTime: TEN,
        Unit: 300,
        Observations: 'algo',
      });
    });

    it('repetir la petición es inocuo: unchanged, sin escribir', async () => {
      const body = {
        employeeId: 7001,
        plannedStartTime: '2026-11-26T10:00:00-05:00',
        plannedEndTime: ELEVEN,
        observations: 'algo',
      };

      expect((await patch(body)).body.result).toBe('applied');
      const res = await patch({
        ...body,
        plannedStartTime: '2026-11-26T15:00:00.400Z',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        result: 'unchanged',
        data: { id: ID, employee: { id: 7001 } },
      });
      expect(writes()).toHaveLength(1);
    });

    it('solo se envía lo que cambia', async () => {
      store.put(ID, { Employee: 7001, Observations: 'algo' });

      await patch({ employeeId: 7001, observations: 'otra cosa' });

      expect(writes()).toEqual([[ID, { Observations: 'otra cosa' }]]);
    });

    it('un cruce se guarda con aviso', async () => {
      store.put(5101, {
        Employee: 7001,
        PlannedStartTime: '2026-11-26T15:30:00Z',
        PlannedEndTime: NOON,
      });
      // Justo a continuación, de otro operario y cerrada: no se cruzan.
      store.put(5102, {
        Employee: 7001,
        PlannedStartTime: ELEVEN,
        PlannedEndTime: NOON,
      });
      store.put(5103, {
        Employee: 7002,
        PlannedStartTime: TEN,
        PlannedEndTime: NOON,
      });
      store.put(5104, {
        Employee: 7001,
        PlannedStartTime: TEN,
        PlannedEndTime: NOON,
        phase: PHASE_IDS.COMPLETED,
      });

      const res = await patch({
        employeeId: 7001,
        plannedStartTime: TEN,
        plannedEndTime: ELEVEN,
      });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
      expect(res.body.warnings).toEqual([
        {
          code: 'overlap',
          cleanings: [
            {
              id: 5101,
              description: 'Limpieza - Suite 5101',
              phase: 'Assigned',
              plannedStartTime: '2026-11-26T15:30:00Z',
              plannedEndTime: NOON,
            },
          ],
        },
      ]);
      expect(store.get(ID).Employee).toBe(7001);
    });

    it.each([
      ['no_schedule', {}],
      [
        'started',
        {
          phase: PHASE_IDS.IN_EXECUTION,
          ActualStartTime: TEN,
          PlannedStartTime: TEN,
          PlannedEndTime: ELEVEN,
        },
      ],
      ['closed', { phase: PHASE_IDS.COMPLETED }],
      ['closed', { phase: PHASE_IDS.REVIEWED }],
      ['closed', { phase: PHASE_IDS.CANCELLED }],
    ])('en cualquier estado, con el aviso %s', async (code, card) => {
      store.put(ID, card);

      const res = await patch({ employeeId: 7001 });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
      expect(res.body.warnings).toEqual([{ code }]);
      expect(writes()).toEqual([[ID, { Employee: 7001 }]]);
    });

    it('dos cambios simultáneos de la misma limpieza no se pisan', async () => {
      const [first, second] = await Promise.all([
        patch({ employeeId: 7001 }),
        patch({ plannedStartTime: TEN, plannedEndTime: ELEVEN }),
      ]);

      expect([first.body.result, second.body.result]).toEqual([
        'applied',
        'applied',
      ]);
      expect(store.get(ID)).toMatchObject({
        Employee: 7001,
        PlannedStartTime: '2026-11-26T15:00:00.000Z',
      });
    });
  });

  describe('referencias y fallos', () => {
    useClient('referencias');

    it.each([
      ['un operario de otro equipo', { employeeId: 9999 }],
      ['un checklist que no existe', { checklistId: 9999 }],
      ['el checklist de supervisión', { checklistId: 9200 }],
      ['una unidad que no existe', { unitId: 999 }],
    ])('400 con %s', async (_case, body) => {
      const res = await patch(body);

      expect(res.status).toBe(400);
      expect(writes()).toEqual([]);
    });

    it('sin equipo configurado: 503 solo si se asigna a alguien', async () => {
      await withEnv({ OPENMAINT_CLEANING_TEAM_ID: '' }, async () => {
        expect((await patch({ employeeId: 7001 })).status).toBe(503);
        expect(writes()).toEqual([]);
        expect((await patch({ observations: 'x' })).status).toBe(200);
      });
    });

    it('404 si la limpieza no existe', async () => {
      expect((await patch({ observations: 'x' }, 9999)).status).toBe(404);
      expect((await cancel({ reason: 'x' }, 9999)).status).toBe(404);
      expect(writes()).toEqual([]);
    });

    it('502 si no se puede leer la limpieza, el equipo, la unidad o la agenda', async () => {
      for (const [method, body] of [
        ['getTaskByIdWithSession', { observations: 'x' }],
        ['listEmployees', { employeeId: 7001 }],
        ['listChecklistOptions', { checklistId: 9100 }],
        ['getUnitByIdWithSession', { unitId: 300 }],
        [
          'getAllTasks',
          { employeeId: 7001, plannedStartTime: TEN, plannedEndTime: ELEVEN },
        ],
      ] as const) {
        store.attach(mocks.cleaningTasksOpenmaint);
        gateway()[method].mockRejectedValue(upstreamError(500));
        expect((await patch(body)).status).toBe(502);
      }
      expect(writes()).toEqual([]);
    });

    it('502 si la escritura no se confirma', async () => {
      gateway().updateCleaningTask.mockRejectedValue(upstreamError(500));

      const res = await patch({ observations: 'x' });

      expect(res.status).toBe(502);
      expect(res.body.message).toMatch(/comprobar antes de repetir/);
    });

    it('guardado pero ilegible: 200 con data null', async () => {
      const card = structuredClone(store.get(ID));
      gateway()
        .getTaskByIdWithSession.mockReset()
        .mockResolvedValueOnce({ data: card })
        .mockRejectedValue(upstreamError(500));

      const res = await patch({ observations: 'x' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: null, result: 'applied', warnings: [] });
    });
  });

  describe('cancelar', () => {
    useClient('cancelar');

    it.each([
      ['asignada', PHASE_IDS.ASSIGNED, ['closed']],
      ['en ejecución', PHASE_IDS.IN_EXECUTION, ['closed']],
    ])('%s: applied', async (_case, phase, codes) => {
      store.put(ID, { phase, Employee: 7001 });

      const res = await cancel({ reason: '  Se canceló la reserva ' });

      expect(res.status).toBe(200);
      expect(writes()).toEqual([
        [ID, { phase: PHASE_IDS.CANCELLED, Notes: 'Se canceló la reserva' }],
      ]);
      expect(res.body).toMatchObject({
        result: 'applied',
        data: { id: ID, phase: 'Cancelled' },
      });
      expect(res.body.warnings.map((w: { code: string }) => w.code)).toEqual(
        codes,
      );
    });

    it('anula las supervisiones abiertas; si falla, sigue cancelada', async () => {
      const supervisions = mocks.cleaningSupervisionsOpenmaint;
      supervisions.findByTask.mockResolvedValue([
        { _id: 61, CleaningTask: ID, _Phase_code: 'InCorrection' },
        { _id: 62, CleaningTask: ID, _Phase_code: 'Approved' },
      ]);

      expect((await cancel({ reason: 'x' })).body.result).toBe('applied');
      expect(supervisions.updateSupervision.mock.calls).toEqual([
        [61, { Phase: SUPERVISION_PHASE_IDS.Cancelled }],
      ]);

      store.put(5201);
      supervisions.updateSupervision.mockRejectedValue(upstreamError(500));
      const res = await cancel({ reason: 'x' }, 5201);
      expect(res.status).toBe(200);
      expect(res.body.result).toBe('applied');
    });

    it('ya cancelada: unchanged, sin escribir ni cambiar el motivo', async () => {
      store.put(ID, { phase: PHASE_IDS.CANCELLED, Notes: 'Motivo original' });

      const res = await cancel({ reason: 'otro' });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('unchanged');
      expect(writes()).toEqual([]);
      expect(store.get(ID).Notes).toBe('Motivo original');
    });

    it.each([
      ['terminada', PHASE_IDS.COMPLETED],
      ['revisada', PHASE_IDS.REVIEWED],
    ])('409 si está %s', async (_case, phase) => {
      store.put(ID, { phase });

      expect((await cancel({ reason: 'x' })).status).toBe(409);
      expect(writes()).toEqual([]);
    });
  });

  describe('POST /plans', () => {
    useClient('planes');

    it('no es atómico: cada cambio trae su resultado, en orden', async () => {
      store.put(5302, { Observations: 'igual' });
      store.put(5304);
      store.put(5305);
      const update = gateway().updateCleaningTask.getMockImplementation();
      gateway().updateCleaningTask.mockImplementation(
        (id: number, body: object) =>
          id === 5305
            ? Promise.reject(upstreamError(500))
            : (update?.(id, body) as Promise<unknown>),
      );

      const res = await plans({
        changes: [
          { id: ID, observations: 'x' },
          { id: 5302, observations: 'igual' },
          { id: 9999, observations: 'x' },
          { id: 5304, employeeId: 9999 },
          { id: 5305, observations: 'x' },
          { id: 5304 + 100, observations: 'x' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(false);
      expect(res.body.results).toEqual([
        { id: ID, result: 'applied', warnings: [], error: null },
        { id: 5302, result: 'unchanged', warnings: [], error: null },
        expect.objectContaining({
          id: 9999,
          result: 'failed',
          error: { statusCode: 404, message: expect.any(String) as string },
        }),
        expect.objectContaining({
          id: 5304,
          result: 'failed',
          error: { statusCode: 400, message: expect.any(String) as string },
        }),
        expect.objectContaining({
          id: 5305,
          result: 'failed',
          error: { statusCode: 502, message: expect.any(String) as string },
        }),
        expect.objectContaining({ id: 5404, result: 'failed' }),
      ]);
      expect(res.body.summary).toEqual({
        applied: 1,
        unchanged: 1,
        valid: 0,
        failed: 4,
        not_attempted: 0,
      });
    });

    it('dryRun valida y avisa, pero no guarda ni notifica', async () => {
      store.put(5311, {
        Employee: 7001,
        PlannedStartTime: TEN,
        PlannedEndTime: NOON,
      });
      store.put(5312, { Observations: 'igual' });

      const res = await plans({
        dryRun: true,
        changes: [
          {
            id: ID,
            employeeId: 7001,
            plannedStartTime: TEN,
            plannedEndTime: ELEVEN,
          },
          { id: 5312, observations: 'igual' },
          { id: 9999, observations: 'x' },
        ],
      });
      await notices.flush();

      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(true);
      expect(res.body.results).toMatchObject([
        {
          id: ID,
          result: 'valid',
          warnings: [{ code: 'overlap', cleanings: [{ id: 5311 }] }],
        },
        { id: 5312, result: 'unchanged' },
        { id: 9999, result: 'failed', error: { statusCode: 404 } },
      ]);
      expect(writes()).toEqual([]);
      expect(store.get(ID).Employee).toBeNull();
      expect(
        mocks.pushDispatch.notifyCleaningPlanUpdated,
      ).not.toHaveBeenCalled();
      expect(mocks.pushDispatch.notifyCleaningAssigned).not.toHaveBeenCalled();
    });

    it('los cruces se miran sobre cómo queda el lote', async () => {
      const slot = { plannedStartTime: TEN, plannedEndTime: ELEVEN };
      store.put(5321, {
        Employee: 7001,
        PlannedStartTime: TEN,
        PlannedEndTime: ELEVEN,
      });
      store.put(5322);
      store.put(5323);

      // 5321 deja libre a 7001; 5322 ocupa su hueco. 5322 y 5323 se cruzan.
      const res = await plans({
        changes: [
          { id: 5322, employeeId: 7001, ...slot },
          { id: 5321, employeeId: 7002 },
          { id: 5323, employeeId: 7001, ...slot },
        ],
      });

      expect(res.body.results).toMatchObject([
        {
          id: 5322,
          warnings: [{ code: 'overlap', cleanings: [{ id: 5323 }] }],
        },
        { id: 5321, result: 'applied', warnings: [] },
        {
          id: 5323,
          warnings: [{ code: 'overlap', cleanings: [{ id: 5322 }] }],
        },
      ]);
    });

    it('25 cambios sí caben', async () => {
      const changes = Array.from({ length: 25 }, (_, i) => {
        store.put(5400 + i);
        return { id: 5400 + i, observations: 'x' };
      });

      const res = await plans({ changes });

      expect(res.status).toBe(200);
      expect(res.body.summary.applied).toBe(25);
      expect(writes()).toHaveLength(25);
    });
  });

  describe('la lectura posterior ve el cambio', () => {
    useClient('cache');

    it('listado, ficha y operarios, aunque estuvieran en caché', async () => {
      const cleaners = `${API}/cleaners?from=2026-11-26T05:00:00Z&to=2026-11-27T05:00:00Z`;
      const list = `${CLEANINGS}?checkoutDate=2026-11-26`;
      const ana = async () =>
        (await read(cleaners)).body.data.find(
          (cleaner: { id: number }) => cleaner.id === 7001,
        );
      expect((await read(list)).body.data[0].employee).toBeNull();
      expect((await read(`${CLEANINGS}/${ID}`)).body.data.employee).toBeNull();
      expect((await ana()).cleanings).toEqual([]);

      await patch({
        employeeId: 7001,
        plannedStartTime: TEN,
        plannedEndTime: ELEVEN,
      });

      expect((await read(list)).body.data[0].employee.id).toBe(7001);
      expect((await read(`${CLEANINGS}/${ID}`)).body.data.employee.id).toBe(
        7001,
      );
      expect(await ana()).toMatchObject({
        plannedMinutes: 60,
        cleanings: [{ id: ID }],
      });

      await cancel({ reason: 'x' });
      expect((await read(list)).body.data[0].phase).toBe('Cancelled');
      expect((await ana()).cleanings).toEqual([]);
    });

    it('también tras un lote y tras una escritura fallida', async () => {
      const list = `${CLEANINGS}?checkoutDate=2026-11-26&limit=7`;
      await read(list);

      await plans({ changes: [{ id: ID, observations: 'lote' }] });
      expect((await read(list)).body.data[0].taskObservations).toBe('lote');

      // Se guardó, pero la respuesta se perdió.
      gateway().updateCleaningTask.mockImplementationOnce(() => {
        Object.assign(store.get(ID), { Observations: 'perdida' });
        return Promise.reject(upstreamError(504));
      });
      // Se relee antes de dar el error: si quedó guardado, responde 200.
      expect((await patch({ observations: 'perdida' })).status).toBe(200);
      expect((await read(list)).body.data[0].taskObservations).toBe('perdida');
    });

    it('una lectura empezada antes del cambio no repone el dato viejo', async () => {
      const list = `${CLEANINGS}?checkoutDate=2026-11-26&limit=9`;
      const old = structuredClone(store.get(ID));
      let release = () => {};
      gateway().getAllTasks.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve({ data: [old], meta: { total: 1 } });
          }),
      );

      const slow = read(list);
      await until(() => gateway().getAllTasks.mock.calls.length === 1);
      expect((await patch({ observations: 'nuevo' })).status).toBe(200);
      release();
      await slow;

      expect((await read(list)).body.data[0].taskObservations).toBe('nuevo');
    });
  });

  describe('avisos agrupados', () => {
    const planUpdated = () =>
      mocks.pushDispatch.notifyCleaningPlanUpdated.mock.calls as unknown[][];
    const assigned = () =>
      mocks.pushDispatch.notifyCleaningAssigned.mock.calls as unknown[][];
    const none = { assigned: 0, rescheduled: 0, removed: 0, cancelled: 0 };

    describe('diez cambios', () => {
      useClient('avisos-diez');

      it('al mismo operario: un solo aviso, y solo tras la calma', async () => {
        for (let i = 0; i < 10; i += 1) {
          store.put(5500 + i);
          expect((await patch({ employeeId: 7001 }, 5500 + i)).status).toBe(
            200,
          );
        }
        expect(planUpdated()).toEqual([]);

        await notices.flush();
        await notices.flush();

        expect(planUpdated()).toEqual([
          [{ cleaningEmployeeId: 7001, counts: { ...none, assigned: 10 } }],
        ]);
        expect(assigned()).toEqual([]);
      });
    });

    describe('neto por operario', () => {
      useClient('avisos');

      it('una sola asignación usa el aviso de siempre', async () => {
        store.put(ID, { Unit: 300, _Unit_description: 'R302' });

        await patch({ employeeId: 7001 });
        await notices.flush();

        expect(assigned()).toEqual([
          [
            {
              id: ID,
              cleaningEmployeeId: 7001,
              unitName: 'R302',
              buildingName: 'Pradera',
            },
          ],
        ]);
        expect(planUpdated()).toEqual([]);
      });

      it('asignar y quitar no avisa a nadie', async () => {
        await patch({ employeeId: 7001 });
        await patch({ employeeId: null });
        await notices.flush();

        expect([...assigned(), ...planUpdated()]).toEqual([]);
      });

      it('un lote avisa una vez a cada afectado, también al que se le quita', async () => {
        store.put(5511, { Employee: 7001 });
        store.put(5512, {
          Employee: 7002,
          PlannedStartTime: TEN,
          PlannedEndTime: ELEVEN,
        });
        store.put(5513, { Employee: 7002 });

        await plans({
          changes: [
            { id: 5511, employeeId: 7002 },
            { id: 5512, plannedEndTime: NOON },
          ],
        });
        await cancel({ reason: 'x' }, 5513);
        await notices.flush();

        expect(assigned()).toEqual([]);
        expect(planUpdated()).toHaveLength(2);
        expect(planUpdated()).toEqual(
          expect.arrayContaining([
            [{ cleaningEmployeeId: 7001, counts: { ...none, removed: 1 } }],
            [
              {
                cleaningEmployeeId: 7002,
                counts: {
                  assigned: 1,
                  rescheduled: 1,
                  removed: 0,
                  cancelled: 1,
                },
              },
            ],
          ]),
        );
      });

      it('sin aviso por textos, checklist, lo repetido o lo cerrado', async () => {
        store.put(5521, { Employee: 7001 });
        store.put(5522, { Employee: 7001, phase: PHASE_IDS.COMPLETED });

        await plans({
          changes: [
            {
              id: 5521,
              employeeId: 7001,
              observations: 'x',
              description: 'Otra',
              checklistId: 9100,
            },
            { id: 5522, employeeId: 7002 },
          ],
        });
        await notices.flush();

        expect([...assigned(), ...planUpdated()]).toEqual([]);
      });

      it('un fallo al enviar no afecta a lo guardado', async () => {
        mocks.pushDispatch.notifyCleaningPlanUpdated.mockRejectedValueOnce(
          new Error('push caído'),
        );
        store.put(5531, { Employee: 7001 });

        expect((await patch({ employeeId: null }, 5531)).status).toBe(200);
        await notices.flush();

        expect(planUpdated()).toHaveLength(1);
        expect(store.get(5531).Employee).toBeNull();
      });
    });
  });

  describe('cupo', () => {
    useClient('cupo');

    it('429 al pasar de 20 escrituras, sin afectar a la lectura ni a otro cliente', async () => {
      for (let i = 0; i < 20; i += 1) {
        expect((await patch({ phase: 'x' })).status).toBe(400);
      }

      const res = await patch({ observations: 'x' });

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBe('60');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect((await cancel({ reason: 'x' })).status).toBe(429);
      expect((await plans({ changes: [] })).status).toBe(429);
      expect((await call('get', `${CLEANINGS}/${ID}`)).status).toBe(200);
      expect(writes()).toEqual([]);

      client = 'otro';
      expect((await patch({ observations: 'x' })).status).toBe(200);
    });
  });

  describe('/cleaning-tasks responde igual', () => {
    const token = { 'x-session-token': 'mock-session-token' };
    const dto = {
      hostawayReservationId: 'R-900',
      listingName: 'Suite Azul',
      listingId: '331',
      checkoutDate: '2026-11-26',
      checkoutTime: '11:00',
    };

    beforeEach(() => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'CoordinadorSL' }),
      );
    });

    it('PUT guarda y avisa al momento, sin agrupar', async () => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'SupervisorLimpieza' }),
      );

      const res = await request(app.getHttpServer())
        .put(`/cleaning-tasks/${ID}`)
        .set(token)
        .send({ employeeId: 7001, desconocido: 'x' })
        .expect(200);

      expect(res.body).toEqual({ updated: true, taskId: ID, notified: 7001 });
      expect(writes()).toEqual([[ID, { Employee: 7001 }]]);
      await until(
        () => mocks.pushDispatch.notifyCleaningAssigned.mock.calls.length === 1,
      );
    });

    it('POST crea, y repetido no duplica', async () => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'Coordinador' }),
      );
      const post = () =>
        request(app.getHttpServer())
          .post('/cleaning-tasks')
          .set(token)
          .send(dto)
          .expect(201);

      const res = await post();
      expect(res.body).toEqual({
        created: true,
        taskId: expect.any(Number) as number,
        taskNumber: expect.stringMatching(/^CT\./) as string,
        reservationId: 'R-900',
      });
      expect((await post()).body).toEqual({
        created: false,
        message: 'Ya existe una tarea para la reserva R-900',
      });
      expect(gateway().createCleaningTask).toHaveBeenCalledTimes(1);
    });

    it('POST /generate conserva su resumen', async () => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'Coordinador' }),
      );
      store.put(5601, { HostawayReservation: 'R-901' });

      const res = await request(app.getHttpServer())
        .post('/cleaning-tasks/generate')
        .set(token)
        .send({
          checkouts: ['R-901', 'R-902', 'R-903', 'R-904', 'R-905'].map(
            (hostawayReservationId) => ({ ...dto, hostawayReservationId }),
          ),
        })
        .expect(201);

      expect(res.body).toEqual({
        created: 4,
        skipped: 1,
        failed: 0,
        total: 5,
        errors: [],
      });
    });

    it('GET / y GET /all conservan su forma', async () => {
      gateway().getCleaningTasks.mockResolvedValueOnce({
        data: [store.get(ID)],
      });
      mocks.openmaint.getSession.mockResolvedValueOnce(
        mockSession({ role: 'Coordinador' }),
      );
      const open = await request(app.getHttpServer())
        .get('/cleaning-tasks?date=2026-11-25')
        .set(token)
        .expect(200);
      expect(open.body.tasks).toMatchObject([{ id: ID, phase: 'Assigned' }]);

      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'SupervisorLimpieza' }),
      );
      const all = await request(app.getHttpServer())
        .get(
          '/cleaning-tasks/all?limit=5&checkoutDate=2026-01-01&assigned=true',
        )
        .set(token)
        .expect(200);
      // Los filtros nuevos son solo de la API de integración.
      expect(all.body).toMatchObject({
        success: true,
        data: [{ id: ID }],
        meta: { total: 1, limit: 5, offset: 0 },
      });
    });

    it('la clave de escritura no abre sus rutas', async () => {
      for (const [method, path] of [
        ['get', '/cleaning-tasks/all'],
        ['put', `/cleaning-tasks/${ID}`],
        ['get', '/cleaning-tasks/employees'],
      ] as const) {
        await request(app.getHttpServer())
          [method](path)
          .set('x-api-key', writeKey('otro'))
          .send({ observations: 'x' })
          .expect(401);
      }
      expect(writes()).toEqual([]);
    });
  });
});
