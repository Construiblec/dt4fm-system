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

const BASE = '/integrations/v1/correctives';
const KEY = 'e2e-clave-correctivos-0123456789abcdefg';

const READ_METHODS = new Set([
  'search',
  'findById',
  'findAttachments',
  'downloadAttachment',
]);

const REGISTER = `
<div class="opm_register_entry">
  <span data-block="date">10 Nov 2026</span><span data-block="time">08:00</span>
  <span data-block="step">CM01 - Opening</span>
  <span data-block="userdescr">Huésped Secreto</span>
  <span data-block="notes">Gotea el lavabo</span>
</div>
<div class="opm_register_entry">
  <span data-block="date">11 Nov 2026</span><span data-block="time">09:30</span>
  <span data-block="step">CM02 - Assignment</span>
  <span data-block="userdescr">Ana Ruiz</span>
  <span data-block="notes">Duplicada, se cancela</span>
</div>`;

const collectKeys = (value: unknown, keys = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
};

const expectNoLeaks = (body: unknown) => {
  expect([...collectKeys(body)].filter((k) => k.startsWith('_'))).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(
    /openmaint|cmdbuild|Secreto|Requester|svc-interno|autor\.interno/i,
  );
};

describe('CorrectivesApiController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let store: MaintenanceStore;
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('x-api-key', KEY);

  const calledMethods = () =>
    Object.entries(mocks.correctiveOpenmaint as Record<string, jest.Mock>)
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
  });

  afterEach(() => {
    // Solo lecturas, nada directo al cliente HTTP y ningún aviso.
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
      ['nombre del cliente incluido', `correctivos:${KEY}`],
    ])('401 %s, sin llamar a la fuente', async (_case, key) => {
      const call = request(app.getHttpServer()).get(BASE);
      if (key !== undefined) void call.set('x-api-key', key);

      const res = await call.expect(401);

      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(calledMethods()).toEqual([]);
    });

    it('401 también en ficha, descarga y apoyo', async () => {
      for (const path of [
        `${BASE}/1`,
        `${BASE}/1/attachments/a1`,
        '/integrations/v1/technicians',
        '/integrations/v1/corrective-categories',
      ]) {
        await request(app.getHttpServer()).get(path).expect(401);
      }
      expect(calledMethods()).toEqual([]);
    });

    it('no hay otras rutas de escritura: 404, y las existentes exigen la clave de escritura', async () => {
      for (const method of ['post', 'put', 'delete'] as const) {
        await request(app.getHttpServer())
          [method](`${BASE}/1`)
          .set('x-api-key', KEY)
          .expect(404);
      }
      // Con la clave de lectura, PATCH existe pero está vedado.
      await request(app.getHttpServer())
        .patch(`${BASE}/1`)
        .set('x-api-key', KEY)
        .send({ employeeId: 7 })
        .expect(403);
      expect(calledMethods()).toEqual([]);
    });
  });

  describe('listado', () => {
    it('200 con los campos del contrato y sin datos internos ni de quien reportó', async () => {
      const card = store.corrective('Execution', {
        Priority: 118,
        _Priority_description: 'Alta',
        Floor: 12,
        _Floor_description: 'Piso 3',
        Unit: 300,
        _Unit_description: 'R302',
        Asset: 40,
        _Asset_description: 'Bomba 1',
        Category: 2,
        _Category_description: 'MNT - Mantenimiento',
        Subcategory: 22,
        _Subcategory_description: 'Plomería',
        Assignee: 9,
        _Assignee_description: 'Luis Pérez',
        Team: 501,
        _Team_description: 'Mantenimiento',
        Requester: 77,
        _Requester_description: 'Huésped Secreto',
        ExpExecStartDate: '2026-11-16T15:00:00Z',
        ExecStartDate: null,
        _user: 'svc-interno',
      });

      const res = await get(`${BASE}?status=Assigned&unitId=300`).expect(200);

      expect(res.body.meta).toEqual({
        total: 1,
        limit: 50,
        offset: 0,
        nextOffset: null,
      });
      expect(res.body.data).toEqual([
        {
          kind: 'corrective',
          id: card._id,
          number: card.Number,
          title: `Orden ${card._id}`,
          status: 'Assigned',
          statusLabel: 'Asignado',
          isClosed: false,
          building: { id: 3019998, name: 'Pradera' },
          assignee: { id: 9, name: 'Luis Pérez' },
          team: { id: 501, name: 'Mantenimiento' },
          openingDate: '2026-11-10T13:00:00Z',
          plannedStartTime: '2026-11-16T15:00:00Z',
          actualStartTime: null,
          actualEndTime: null,
          warnings: [],
          priority: { code: 'High', label: 'Alta' },
          category: { id: 2, name: 'Mantenimiento' },
          subcategory: { id: 22, name: 'Plomería', isOther: false },
          floor: { id: 12, name: 'Piso 3' },
          unit: { id: 300, name: 'R302' },
          commonArea: null,
          asset: { id: 40, name: 'Bomba 1' },
          closureDate: null,
          isPendingReview: false,
        },
      ]);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expectNoLeaks(res.body);
    });

    it('filtra por estado derivado, cesionario, edificio y rango [desde, hasta)', async () => {
      const started = store.corrective('Execution', {
        Site: 7001,
        ExecStartDate: '2026-11-16T15:05:00Z',
        Assignee: 9,
      });
      const assigned = store.corrective('Execution', {
        Site: 7001,
        ExecStartDate: null,
        Assignee: 9,
        ExpExecStartDate: '2026-11-16T10:00:00Z',
      });
      const atEdge = store.corrective('Assignment', {
        Site: 7001,
        ExpExecStartDate: '2026-11-17T05:00:00Z',
      });
      const orphan = store.corrective('Assignment', { Site: 7001 });

      const ids = async (query: string) =>
        (await get(`${BASE}?buildingId=7001&${query}`).expect(200)).body.data
          .map((item: { id: number }) => item.id)
          .sort();

      expect(await ids('status=Execution')).toEqual([started._id]);
      expect(await ids('status=Assigned')).toEqual([assigned._id]);
      expect(await ids('assigned=false')).toEqual(
        [atEdge._id, orphan._id].sort(),
      );
      // Hasta excluido: el de las 05:00Z queda fuera.
      expect(
        await ids(
          'plannedFrom=2026-11-16T05:00:00Z&plannedTo=2026-11-17T05:00:00Z',
        ),
      ).toEqual([assigned._id]);
    });

    it('pagina y marca nextOffset', async () => {
      for (let i = 0; i < 3; i++) store.corrective('Completed', { Site: 7002 });

      const res = await get(`${BASE}?buildingId=7002&limit=2`).expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toEqual({
        total: 3,
        limit: 2,
        offset: 0,
        nextOffset: 2,
      });
      const last = await get(`${BASE}?buildingId=7002&limit=2&offset=2`).expect(
        200,
      );
      expect(last.body.data).toHaveLength(1);
      expect(last.body.meta.nextOffset).toBeNull();
    });

    it.each([
      'sort=newest',
      'status=',
      'buildingId=',
      'status=Planning',
      'status=Assigned,Execution',
      'priority=Urgent',
      'assigned=false&employeeId=4',
      'plannedFrom=2026-11-16',
      'plannedFrom=2026-11-17T00:00:00Z&plannedTo=2026-11-16T00:00:00Z',
      'limit=101',
      'dueFrom=2026-11-16T00:00:00Z',
    ])('400 con ?%s, sin llamar a la fuente', async (query) => {
      const res = await get(`${BASE}?${query}`).expect(400);

      expect(JSON.stringify(res.body)).not.toMatch(/openmaint/i);
      expect(calledMethods()).toEqual([]);
    });

    it('502 sin filtrar el detalle de la fuente si esta falla', async () => {
      mocks.correctiveOpenmaint.search.mockRejectedValue(upstreamError(500));

      const res = await get(`${BASE}?buildingId=7003`).expect(502);

      expect(JSON.stringify(res.body)).not.toMatch(/openmaint|invalid/i);
    });

    it('un listado sin data es 502, nunca una lista vacía', async () => {
      mocks.correctiveOpenmaint.search.mockResolvedValue({});

      await get(`${BASE}?buildingId=7004`).expect(502);
    });

    it('503 sin llamar a la fuente con la sesión en enfriamiento o vacía', async () => {
      isCoolingDown.mockReturnValue(true);
      await get(`${BASE}?buildingId=7005`).expect(503);

      isCoolingDown.mockReturnValue(false);
      getSessionId.mockResolvedValue('');
      await get(`${BASE}?buildingId=7006`).expect(503);

      expect(calledMethods()).toEqual([]);
    });
  });

  describe('ficha', () => {
    it('200 con bitácora, adjuntos, nota de reporte y sin motivo si no está cancelado', async () => {
      const card = store.corrective('Execution', {
        Register: REGISTER,
        Requester: 77,
        _Requester_description: 'Huésped Secreto',
      });
      store.attach('corrective', card._id, {
        _id: 'att-1',
        name: 'foto.jpg',
        fileName: '',
        category: '8801',
        _category_description: 'Photo',
        description: 'Antes',
        created: '2026-11-11T10:00:00Z',
        author: 'autor.interno',
      });

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data).toMatchObject({
        id: card._id,
        reportNotes: 'Gotea el lavabo',
        cancelReason: null,
        attachments: [
          {
            id: 'att-1',
            fileName: 'foto.jpg',
            description: 'Antes',
            category: 'Photo',
            uploadDate: '2026-11-11T10:00:00Z',
            downloadUrl: `/integrations/v1/correctives/${card._id}/attachments/att-1`,
          },
        ],
      });
      expect(
        res.body.data.log.map((e: { author: string }) => e.author),
      ).toEqual(['Ana Ruiz']);
      expectNoLeaks(res.body);
    });

    it('cancelado: el motivo es la nota del último CM02', async () => {
      const card = store.corrective('Canceled', {
        Register: REGISTER,
        _FlowStatus_code: 'closed.completed',
      });

      const res = await get(`${BASE}/${card._id}`).expect(200);

      expect(res.body.data).toMatchObject({
        status: 'Canceled',
        isClosed: true,
        cancelReason: 'Duplicada, se cancela',
      });
    });

    it('404 si no existe, y 400 con un id inválido', async () => {
      await get(`${BASE}/987654`).expect(404);
      await get(`${BASE}/1e2`).expect(400);
      await get(`${BASE}/0`).expect(400);
    });

    it('502 si fallan los adjuntos', async () => {
      const card = store.corrective('Execution');
      mocks.correctiveOpenmaint.findAttachments.mockRejectedValue(
        upstreamError(500),
      );

      await get(`${BASE}/${card._id}`).expect(502);
    });
  });

  describe('descarga', () => {
    it('envía el archivo con cabeceras seguras', async () => {
      const card = store.corrective('Execution');
      store.attach('corrective', card._id, {
        _id: 'att-9',
        name: 'informe.html',
        contentType: 'text/html',
        content: '<script>x</script>',
      });

      const res = await get(`${BASE}/${card._id}/attachments/att-9`).expect(
        200,
      );

      expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toBe(
        "attachment; filename*=UTF-8''informe.html",
      );
      expect(res.headers['cache-control']).toBe('private, no-store');
    });

    it('404 si el adjunto es de otra orden, sin descargarlo', async () => {
      const mine = store.corrective('Execution');
      const other = store.corrective('Execution');
      store.attach('corrective', other._id, {
        _id: 'att-ajeno',
        name: 'x.jpg',
      });

      await get(`${BASE}/${mine._id}/attachments/att-ajeno`).expect(404);

      expect(
        mocks.correctiveOpenmaint.downloadAttachment,
      ).not.toHaveBeenCalled();
    });

    it('404 si la orden no existe y 400 con un id de archivo inválido', async () => {
      await get(`${BASE}/987655/attachments/att-1`).expect(404);
      await get(`${BASE}/1/attachments/..%2Fx`).expect(400);
    });
  });
});
