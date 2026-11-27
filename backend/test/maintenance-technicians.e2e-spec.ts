import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import { MaintenanceStore, upstreamError } from './helpers/maintenance-store';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { MOCK_SESSION_ID } from './mocks/openmaint-core.mock';

const API = '/integrations/v1';
const KEY = 'e2e-clave-tecnicos-0123456789abcdefghijk';

// Equipos de OPENMAINT_MAINTENANCE_TEAM_IDS en setup-env.ts.
const TEAMS = { campo: 501, taller: 502 };

describe('Técnicos y categorías (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let store: MaintenanceStore;
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('x-api-key', KEY);

  const withEnv = async (value: string, run: () => Promise<void>) => {
    const previous = process.env.OPENMAINT_MAINTENANCE_TEAM_IDS;
    process.env.OPENMAINT_MAINTENANCE_TEAM_IDS = value;
    try {
      await run();
    } finally {
      process.env.OPENMAINT_MAINTENANCE_TEAM_IDS = previous;
    }
  };

  const employee = (id: number, name: string, team: number, extra = {}) => ({
    _id: id,
    Description: name,
    Team: team,
    _Team_description: team === TEAMS.campo ? 'Campo' : 'Taller',
    _type: 'InternalEmployee',
    ...extra,
  });

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());

    const session = app.get(CleaningTasksSessionService);
    getSessionId = jest.spyOn(session, 'getSessionId');
    isCoolingDown = jest.spyOn(session, 'isCoolingDown');
  });

  beforeEach(() => {
    resetMockCalls();
    getSessionId.mockReset().mockResolvedValue(MOCK_SESSION_ID);
    isCoolingDown.mockReset().mockReturnValue(false);

    store = new MaintenanceStore();
    store.employees = [
      employee(9, 'Luis Pérez', TEAMS.campo),
      employee(10, 'Ana Gómez', TEAMS.taller),
      employee(11, 'Proveedor SA', TEAMS.taller, {
        _type: 'SupplierEmployee',
      }),
    ];
    store.install(mocks);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('technicians', () => {
    it('401 sin clave, sin llamar a la fuente', async () => {
      await request(app.getHttpServer()).get(`${API}/technicians`).expect(401);

      expect(mocks.openmaint.getEmployees).not.toHaveBeenCalled();
      expect(mocks.correctiveOpenmaint.search).not.toHaveBeenCalled();
    });

    it('agenda por técnico: planificadas, en ejecución y sin fecha', async () => {
      const inRange = store.corrective('Execution', {
        Assignee: 9,
        _Assignee_description: 'Luis Pérez',
        ExecStartDate: null,
        ExpExecStartDate: '2026-11-16T15:00:00Z',
      });
      const running = store.corrective('Execution', {
        Assignee: 9,
        ExecStartDate: '2026-11-16T14:00:00Z',
        ExpExecStartDate: '2026-11-16T13:00:00Z',
      });
      const outside = store.corrective('Execution', {
        Assignee: 9,
        ExpExecStartDate: '2026-12-30T15:00:00Z',
      });
      const undated = store.corrective('Assignment', {
        Assignee: 9,
        ExpExecStartDate: null,
      });
      store.corrective('Assignment', { Assignee: null });
      const preventive = store.preventive('Acceptance', {
        Assignee: 10,
        ExpExecStartDate: '2026-11-17T15:00:00Z',
      });
      const suspended = store.preventive('Suspension', {
        Assignee: 10,
        ExpExecStartDate: null,
      });
      store.preventive('Completed', { Assignee: 10 });
      store.corrective('Execution', { Assignee: 999 });

      const res = await get(
        `${API}/technicians?from=2026-11-16T00:00:00-05:00&to=2026-11-18T00:00:00-05:00`,
      ).expect(200);

      expect(res.body.meta).toEqual({
        from: '2026-11-16T05:00:00.000Z',
        to: '2026-11-18T05:00:00.000Z',
      });
      expect(res.body.data.map((t: { name: string }) => t.name)).toEqual([
        'Ana Gómez',
        'Luis Pérez',
        'Proveedor SA',
      ]);

      const [ana, luis, supplier] = res.body.data;
      expect(luis).toMatchObject({
        id: 9,
        team: { id: TEAMS.campo, name: 'Campo' },
        isSupplier: false,
        inExecution: [{ kind: 'corrective', id: running._id }],
        preventives: [],
      });
      expect(luis.correctives.map((o: { id: number }) => o.id)).toEqual([
        running._id,
        inRange._id,
      ]);
      expect(luis.unscheduled).toEqual([
        expect.objectContaining({ kind: 'corrective', id: undated._id }),
      ]);
      expect(JSON.stringify(luis)).not.toContain(String(outside._id));

      expect(ana.preventives.map((o: { id: number }) => o.id)).toEqual([
        preventive._id,
      ]);
      expect(ana.unscheduled).toEqual([
        expect.objectContaining({ kind: 'preventive', id: suspended._id }),
      ]);
      expect(supplier).toMatchObject({
        isSupplier: true,
        correctives: [],
        preventives: [],
        unscheduled: [],
      });
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(JSON.stringify(res.body)).not.toMatch(/openmaint|"_/i);
    });

    it('lee los empleados de cada equipo configurado y solo lee', async () => {
      await get(
        `${API}/technicians?from=2026-03-01T00:00:00Z&to=2026-03-02T00:00:00Z`,
      ).expect(200);

      const teams = mocks.openmaint.getEmployees.mock.calls.map(
        ([, team]: [string, number]) => team,
      );
      expect(teams.sort()).toEqual([TEAMS.campo, TEAMS.taller]);
      expect(mocks.correctiveOpenmaint.advance).not.toHaveBeenCalled();
      expect(mocks.correctiveOpenmaint.saveFields).not.toHaveBeenCalled();
      expect(mocks.preventiveOpenmaint.advance).not.toHaveBeenCalled();
      expect(mocks.preventiveOpenmaint.saveFields).not.toHaveBeenCalled();
      for (const method of Object.values(mocks.openmaintClient)) {
        expect(method).not.toHaveBeenCalled();
      }
    });

    it.each([
      'from=2026-04-01T00:00:00Z',
      'from=2026-04-02T00:00:00Z&to=2026-04-01T00:00:00Z',
      'from=2026-04-01T00:00:00Z&to=2026-04-15T00:00:01Z',
      'from=2026-04-01',
      'overlap=true',
    ])('400 con ?%s', async (query) => {
      await get(`${API}/technicians?${query}`).expect(400);

      expect(mocks.openmaint.getEmployees).not.toHaveBeenCalled();
    });

    it.each(['', 'abc', '501,', '501,x'])(
      '503 con OPENMAINT_MAINTENANCE_TEAM_IDS=%p, sin tocar la fuente',
      async (value) => {
        await withEnv(value, async () => {
          const res = await get(
            `${API}/technicians?from=2026-05-01T00:00:00Z&to=2026-05-02T00:00:00Z`,
          ).expect(503);

          expect(JSON.stringify(res.body)).toContain(
            'El equipo de mantenimiento no está configurado',
          );
        });

        expect(mocks.openmaint.getEmployees).not.toHaveBeenCalled();
        expect(mocks.correctiveOpenmaint.search).not.toHaveBeenCalled();
      },
    );

    it('502 si falla la lectura de empleados o de la agenda; nunca datos parciales', async () => {
      mocks.openmaint.getEmployees.mockRejectedValue(upstreamError(500));
      await get(
        `${API}/technicians?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z`,
      ).expect(502);

      store.install(mocks);
      mocks.preventiveOpenmaint.search.mockRejectedValue(upstreamError(500));
      const res = await get(
        `${API}/technicians?from=2026-06-03T00:00:00Z&to=2026-06-04T00:00:00Z`,
      ).expect(502);

      expect(JSON.stringify(res.body)).not.toMatch(/openmaint|invalid/i);
    });

    it('502 si la agenda supera el tope', async () => {
      const page = Array.from({ length: 200 }, (_, i) => ({
        _id: 5_000_000 + i,
        _ProcessStatus_code: 'CM-Execution',
        Assignee: 9,
      }));
      mocks.correctiveOpenmaint.search.mockResolvedValue({
        data: page,
        meta: {},
      });

      await get(
        `${API}/technicians?from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z`,
      ).expect(502);
    });

    it('503 con la sesión en enfriamiento, sin llamar a la fuente', async () => {
      isCoolingDown.mockReturnValue(true);

      await get(
        `${API}/technicians?from=2026-08-01T00:00:00Z&to=2026-08-02T00:00:00Z`,
      ).expect(503);

      expect(mocks.openmaint.getEmployees).not.toHaveBeenCalled();
    });
  });

  describe('corrective-categories', () => {
    it('200 con la sesión compartida, nunca una vacía', async () => {
      const res = await get(`${API}/corrective-categories`).expect(200);

      expect(res.body.data[0]).toEqual({
        id: 2,
        code: 'LIM',
        name: 'Limpieza',
        subcategories: [
          { id: 21, name: 'Manchas', isOther: false },
          { id: 29, name: 'Otro', isOther: true },
        ],
      });
      expect(mocks.maintCategories.list).toHaveBeenCalledWith(MOCK_SESSION_ID);
    });

    it('401 sin clave y 400 con parámetros', async () => {
      await request(app.getHttpServer())
        .get(`${API}/corrective-categories`)
        .expect(401);
      await get(`${API}/corrective-categories?x=1`).expect(400);
    });

    it('503 sin sesión, sin llamar al catálogo', async () => {
      // Otra caché: el 200 anterior vive 30 s.
      const { app: other, mocks: otherMocks } = await createTestApp();
      try {
        const session = other.get(CleaningTasksSessionService);
        jest.spyOn(session, 'isCoolingDown').mockReturnValue(false);
        jest.spyOn(session, 'getSessionId').mockResolvedValue('');

        await request(other.getHttpServer())
          .get(`${API}/corrective-categories`)
          .set('x-api-key', KEY)
          .expect(503);

        expect(otherMocks.maintCategories.list).not.toHaveBeenCalled();
      } finally {
        await other.close();
      }
    });
  });
});
