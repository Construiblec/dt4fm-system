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

// La caché de 30 s vive en la app: cada test usa ids o filtros propios.

const BASE = '/integrations/v1/preventives';
const KEY = 'e2e-clave-preventivos-0123456789abcdefg';

// Lo único de los gateways preventivos que esta API puede tocar: nunca los que escriben.
const READ_METHODS = new Set([
  'search',
  'findById',
  'findAttachments',
  'downloadAttachment',
  'findChecklistCard',
  'findTaskDefinition',
  'findLookupValues',
]);

const checklistItem = (overrides: Record<string, unknown>) => ({
  TaskDef: 1,
  Type: 384655,
  ExecOrder: 1,
  Outcome: null,
  ND: false,
  Modified: false,
  _TaskDef_description: 'Presión',
  _CI_description: 'Bomba 1',
  ...overrides,
});

describe('PreventivesApiController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let store: MaintenanceStore;
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('x-api-key', KEY);

  const calledMethods = () =>
    Object.entries(mocks.preventiveOpenmaint as Record<string, jest.Mock>)
      .filter(([, fn]) => fn.mock.calls.length > 0)
      .map(([name]) => name);

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
    store.install(mocks);
    mocks.preventiveOpenmaint.findTaskDefinition
      .mockReset()
      .mockResolvedValue({ data: {} });
    mocks.preventiveOpenmaint.findLookupValues.mockReset().mockResolvedValue({
      data: [
        { _id: 345544, description: 'Ok', active: true },
        { _id: 345546, description: 'Ko', active: true },
      ],
    });
  });

  afterEach(() => {
    expect(calledMethods().filter((name) => !READ_METHODS.has(name))).toEqual(
      [],
    );
    for (const method of Object.values(mocks.openmaintClient)) {
      expect(method).not.toHaveBeenCalled();
    }
    for (const method of Object.values<unknown>(mocks.pushDispatch)) {
      if (jest.isMockFunction(method)) expect(method).not.toHaveBeenCalled();
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('acceso', () => {
    it.each([
      ['sin clave', undefined],
      ['clave equivocada', 'x'.repeat(40)],
    ])('401 %s, sin llamar a la fuente', async (_case, key) => {
      const call = request(app.getHttpServer()).get(BASE);
      if (key !== undefined) void call.set('x-api-key', key);

      await call.expect(401);

      expect(calledMethods()).toEqual([]);
    });

    it('401 en ficha y descarga', async () => {
      for (const path of [`${BASE}/1`, `${BASE}/1/attachments/a1`]) {
        await request(app.getHttpServer()).get(path).expect(401);
      }
      expect(calledMethods()).toEqual([]);
    });
  });

  describe('listado', () => {
    it('200 con los campos del contrato', async () => {
      const card = store.preventive('Acceptance', {
        Site: 8001,
        Assignee: 9,
        _Assignee_description: 'Luis Pérez',
        Team: 501,
        _Team_description: 'Mantenimiento',
        CISubset: 40,
        _CISubset_description: 'Bomba 1',
        PrevMaintConfig: 60,
        _PrevMaintConfig_description: 'Plan mensual',
        ExpExecStartDate: '2026-11-16T15:00:00Z',
        DueExecEndDate: '2020-01-01T00:00:00Z',
        _user: 'svc-interno',
      });

      const res = await get(`${BASE}?buildingId=8001`).expect(200);

      expect(res.body.data).toEqual([
        {
          kind: 'preventive',
          id: card._id,
          number: card.Number,
          title: `Orden ${card._id}`,
          status: 'Acceptance',
          statusLabel: 'PM-Assignment',
          isClosed: false,
          building: { id: 8001, name: 'Pradera' },
          assignee: { id: 9, name: 'Luis Pérez' },
          team: { id: 501, name: 'Mantenimiento' },
          openingDate: '2026-11-10T13:00:00Z',
          plannedStartTime: '2026-11-16T15:00:00Z',
          actualStartTime: null,
          actualEndTime: null,
          warnings: [],
          asset: { id: 40, name: 'Bomba 1' },
          plan: { id: 60, name: 'Plan mensual' },
          dueDate: '2020-01-01T00:00:00Z',
          isOverdue: true,
          suspensionReason: null,
        },
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/openmaint|svc-interno|"_/i);
    });

    it('filtra por estado, activo, plan y vencimiento [desde, hasta)', async () => {
      const inDue = store.preventive('Planning', {
        Site: 8002,
        CI: 41,
        PrevMaintConfig: 61,
        DueExecEndDate: '2026-11-20T05:00:00Z',
      });
      store.preventive('Planning', {
        Site: 8002,
        CI: 41,
        PrevMaintConfig: 61,
        DueExecEndDate: '2026-11-21T05:00:00Z',
      });
      store.preventive('Execution', { Site: 8002, CI: 42 });

      const ids = async (query: string) =>
        (await get(`${BASE}?buildingId=8002&${query}`).expect(200)).body.data
          .map((item: { id: number }) => item.id)
          .sort();

      expect(await ids('status=Execution')).toHaveLength(1);
      expect(await ids('assetId=41&planId=61')).toHaveLength(2);
      expect(
        await ids('dueFrom=2026-11-20T05:00:00Z&dueTo=2026-11-21T05:00:00Z'),
      ).toEqual([inDue._id]);
    });

    it.each([
      'status=Assigned',
      'status=',
      'buildingId=',
      'status=Assignment',
      'unitId=1',
      'priority=High',
      'dueFrom=2026-11-16',
      'assigned=false&employeeId=4',
    ])('400 con ?%s, sin llamar a la fuente', async (query) => {
      await get(`${BASE}?${query}`).expect(400);
      expect(calledMethods()).toEqual([]);
    });

    it('502 si la fuente falla, y nunca una lista vacía', async () => {
      mocks.preventiveOpenmaint.search.mockRejectedValue(upstreamError(500));

      const res = await get(`${BASE}?buildingId=8003`).expect(502);

      expect(JSON.stringify(res.body)).not.toMatch(/openmaint|invalid/i);
    });
  });

  describe('ficha', () => {
    it('200 con checklist leído solo con métodos de lectura', async () => {
      const card = store.preventive('Execution', { Register: null });
      store.checklists.set(card._id, [
        checklistItem({ Outcome: '345544' }),
        checklistItem({
          TaskDef: 2,
          Type: 384656,
          ExecOrder: 2,
          _TaskDef_description: 'Observaciones',
          _CI_description: null,
        }),
      ]);

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data.checklist).toEqual({
        total: 2,
        resolved: 1,
        items: [
          {
            order: 1,
            label: 'Presión',
            kind: 'posneg',
            value: 'Ok',
            isResolved: true,
            equipment: 'Bomba 1',
          },
          {
            order: 2,
            label: 'Observaciones',
            kind: 'text',
            value: null,
            isResolved: false,
            equipment: null,
          },
        ],
      });
      expect(res.body.data.warnings).toEqual([]);
      expect(
        mocks.preventiveOpenmaint.updateChecklistCard,
      ).not.toHaveBeenCalled();
      expect(mocks.preventiveOpenmaint.advance).not.toHaveBeenCalled();
      expect(mocks.preventiveOpenmaint.saveFields).not.toHaveBeenCalled();
    });

    it('sin checklist asociado: checklist null y sin aviso', async () => {
      const card = store.preventive('Acceptance');

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data).toMatchObject({ checklist: null, warnings: [] });
    });

    it('si el checklist falla, la ficha sale con el aviso checklist_unavailable', async () => {
      const card = store.preventive('Acceptance');
      mocks.preventiveOpenmaint.findChecklistCard.mockRejectedValue(
        upstreamError(500),
      );

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data).toMatchObject({
        id: card._id,
        checklist: null,
        warnings: ['checklist_unavailable'],
      });
    });

    it('adjuntos con su URL de descarga', async () => {
      const card = store.preventive('Acceptance');
      store.attach('preventive', card._id, {
        _id: 'att-2',
        name: 'manual.pdf',
        _category_description: 'Document',
      });

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data.attachments).toEqual([
        {
          id: 'att-2',
          fileName: 'manual.pdf',
          description: null,
          category: 'Document',
          uploadDate: null,
          downloadUrl: `/integrations/v1/preventives/${card._id}/attachments/att-2`,
        },
      ]);
    });

    it('404 si no existe, y 400 con un id inválido', async () => {
      await get(`${BASE}/987654`).expect(404);
      await get(`${BASE}/1e2`).expect(400);
    });

    it('503 con la sesión en enfriamiento, sin llamar a la fuente', async () => {
      isCoolingDown.mockReturnValue(true);

      await get(`${BASE}/1`).expect(503);

      expect(calledMethods()).toEqual([]);
    });
  });

  describe('descarga', () => {
    it('envía el archivo con cabeceras seguras', async () => {
      const card = store.preventive('Acceptance');
      store.attach('preventive', card._id, {
        _id: 'att-3',
        name: 'foto.jpg',
        contentType: 'image/jpeg',
      });

      const res = await get(`${BASE}/${card._id}/attachments/att-3`).expect(
        200,
      );

      expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe(
        "attachment; filename*=UTF-8''foto.jpg",
      );
    });

    it('404 si el adjunto es de otra orden', async () => {
      const mine = store.preventive('Acceptance');
      const other = store.preventive('Acceptance');
      store.attach('preventive', other._id, {
        _id: 'att-ajeno',
        name: 'x.jpg',
      });

      await get(`${BASE}/${mine._id}/attachments/att-ajeno`).expect(404);

      expect(
        mocks.preventiveOpenmaint.downloadAttachment,
      ).not.toHaveBeenCalled();
    });
  });
});
