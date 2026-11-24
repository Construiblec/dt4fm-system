import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CleaningTasksSessionService } from '../src/modules/cleaning-tasks/cleaning-tasks.session.service';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { MOCK_SESSION_ID, mockSession } from './mocks/openmaint-core.mock';

// La caché de 30 s vive en la app: cada test usa ids o filtros propios.

const BASE = '/integrations/v1/cleanings';
const KEYS = {
  listado: 'e2e-clave-listado-0123456789abcdefghij',
  ficha: 'e2e-clave-ficha-0123456789abcdefghijkl',
  archivos: 'e2e-clave-archivos-0123456789abcdefghi',
  varios: 'e2e-clave-varios-0123456789abcdefghijk',
  cupo: 'e2e-clave-cupo-0123456789abcdefghijklm',
} as const;

const EXECUTION_CHECKLIST = 9100;
const SUPERVISION_CHECKLIST = 9200;

// Lo único de los gateways que esta API puede tocar.
const READ_METHODS = new Set([
  'getAllTasks',
  'getTaskByIdWithSession',
  'getUnitById',
  'getCleaningActivity',
  'downloadActivityTemplate',
  'getAttachmentsWithSession',
  'downloadAttachmentWithSession',
  'findRecent',
  'findByTask',
  'listFindings',
  'listFindingAttachments',
  'downloadFindingAttachment',
]);

const CSV = [
  'area;guia_area;nombre_item;descripcion_criterio',
  'Dormitorios;Observa camas;Tendido de camas;Sábanas estiradas',
  'Cocina;Observa la cocina;Vajilla;Limpia y guardada',
].join('\r\n');

const taskCard = (id: number, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  _type: 'CleaningTask',
  Description: 'Limpieza - R302',
  TaskNumber: `CT.2026.${id}`,
  phase: 2216396,
  _phase_description: 'Completed',
  GeneratedDate: '2026-11-16',
  PlannedStartTime: '2026-11-16T15:00:00Z',
  PlannedEndTime: '2026-11-16T17:00:00Z',
  ActualStartTime: '2026-11-16T15:05:00Z',
  ActualEndTime: '2026-11-16T16:50:00Z',
  ExecutionTime: 105,
  DelayTime: 5,
  Observations: 'Sin novedad',
  TeamObservations: 'Nota 1: faltan toallas {borrador secreto}',
  Notes: 'Nota de la coordinación',
  HostawayReservation: 'R-4857692',
  HostawayListingID: '331',
  CheckoutDate: '2026-11-16',
  Source: '7001',
  _Source_description: 'Hostaway',
  Unit: 300,
  _Unit_description: 'R302',
  Employee: 4567,
  _Employee_description: 'María López',
  CleaningChecklist: EXECUTION_CHECKLIST,
  _CleaningChecklist_description: 'Checklist estudio',
  // Campos internos que nunca deben salir.
  _user: 'svc-interno',
  InternalField: 'campo-interno',
  ...overrides,
});

const attachment = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  name: `${id}.jpg`,
  fileName: '',
  category: '8801',
  _category_description: 'Photo',
  description: null,
  author: 'autor.interno',
  created: '2026-11-16T16:00:00Z',
  modified: '2026-11-16T16:01:00Z',
  ...overrides,
});

const supervisionCard = (
  id: number,
  taskId: number,
  overrides: Record<string, unknown> = {},
) => ({
  _id: id,
  CleaningTask: taskId,
  Unit: 300,
  Employee: 4567,
  _Employee_description: 'María López',
  Supervisor: 88,
  _Supervisor_description: 'Ana Ruiz',
  Phase: 11851493,
  _Phase_code: 'InCorrection',
  _Phase_description: 'En corrección',
  Checklist: SUPERVISION_CHECKLIST,
  ...overrides,
});

const finding = (id: number, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  Supervision: 1,
  Index: 1,
  Subcategory: 21,
  _Subcategory_description: 'Manchas',
  Observation: 'Mancha en la sábana',
  SolvedBySuperv: false,
  ...overrides,
});

const upstreamError = (status: number) =>
  Object.assign(
    new Error(`openMAINT respondió ${status} en http://openmaint.invalid`),
    { response: { status } },
  );

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
  const forbidden = [...collectKeys(body)].filter(
    (key) =>
      /^can[A-Z]/.test(key) ||
      key.startsWith('_') ||
      ['draftObservations', 'author', 'InternalField'].includes(key),
  );
  expect(forbidden).toEqual([]);
  expect(JSON.stringify(body)).not.toMatch(
    /openmaint|cmdbuild|borrador secreto|autor\.interno|svc-interno|campo-interno|8801|7001|11851493/i,
  );
};

describe('CleaningsApiController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let getSessionId: jest.SpyInstance;
  let isCoolingDown: jest.SpyInstance;

  const calledMethods = () =>
    [mocks.cleaningTasksOpenmaint, mocks.cleaningSupervisionsOpenmaint].flatMap(
      (gateway) =>
        Object.entries(gateway as Record<string, jest.Mock>)
          .filter(([, fn]) => fn.mock.calls.length > 0)
          .map(([name]) => name),
    );

  const get = (path: string, key: string) =>
    request(app.getHttpServer()).get(path).set('x-api-key', key);

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());

    const session = app.get(CleaningTasksSessionService);
    getSessionId = jest.spyOn(session, 'getSessionId');
    isCoolingDown = jest.spyOn(session, 'isCoolingDown');
  });

  beforeEach(() => {
    // Fuera las llamadas del arranque: la sesión real intenta su login contra el trap.
    resetMockCalls();

    const tasks = mocks.cleaningTasksOpenmaint;
    const supervisions = mocks.cleaningSupervisionsOpenmaint;

    getSessionId.mockReset().mockResolvedValue(MOCK_SESSION_ID);
    isCoolingDown.mockReset().mockReturnValue(false);

    tasks.getAllTasks
      .mockReset()
      .mockResolvedValue({ data: [], meta: { total: 0 } });
    tasks.getTaskByIdWithSession
      .mockReset()
      .mockImplementation((id: number) =>
        Promise.resolve({ data: taskCard(id) }),
      );
    tasks.getAttachmentsWithSession.mockReset().mockResolvedValue({ data: [] });
    tasks.downloadAttachmentWithSession.mockReset().mockResolvedValue({
      data: Buffer.from('foto-limpieza'),
      contentType: 'image/jpeg',
      fileName: 'nombre-de-la-fuente.jpg',
    });
    tasks.getUnitById.mockReset().mockImplementation((id: number) =>
      Promise.resolve({
        data: {
          _id: id,
          Code: 'R302',
          Description: 'R302 - Estudio 02',
          Name: 'Estudio 02',
          Building: 3019998,
          _Building_description: 'Pradera',
        },
      }),
    );
    tasks.getCleaningActivity.mockReset().mockImplementation((id: number) =>
      Promise.resolve({
        data:
          id === SUPERVISION_CHECKLIST
            ? { _id: id, Code: 'SUPERVISION', Plantilla: 'att-csv' }
            : {
                _id: id,
                Code: 'EST',
                Description: 'Checklist estudio',
                Detalle: 'Tender camas\nLavar vajilla',
              },
      }),
    );
    tasks.downloadActivityTemplate.mockReset().mockResolvedValue({
      data: Buffer.from(CSV, 'utf8'),
      contentType: 'text/csv',
      fileName: 'Book1.csv',
    });

    supervisions.findRecent.mockReset().mockResolvedValue([]);
    supervisions.findByTask.mockReset().mockResolvedValue([]);
    supervisions.listFindings.mockReset().mockResolvedValue([]);
    supervisions.listFindingAttachments.mockReset().mockResolvedValue([]);
    supervisions.downloadFindingAttachment.mockReset().mockResolvedValue({
      data: Buffer.from('foto-novedad'),
      contentType: 'image/jpeg',
      fileName: 'nombre-de-la-fuente.jpg',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('la API', () => {
    // Tras cada test: solo lecturas, nada directo al cliente HTTP y ningún aviso.
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

    describe('acceso', () => {
      it.each([
        ['sin clave', undefined],
        ['clave vacía', ''],
        ['clave equivocada', 'x'.repeat(40)],
        ['clave recortada', KEYS.varios.slice(0, -1)],
        ['nombre del cliente incluido', `varios:${KEYS.varios}`],
      ])('401 %s, sin llamar a la fuente', async (_case, key) => {
        const call = request(app.getHttpServer()).get(BASE);
        if (key !== undefined) void call.set('x-api-key', key);

        const res = await call.expect(401);

        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(calledMethods()).toEqual([]);
      });

      it('401 con la clave en la URL', async () => {
        await request(app.getHttpServer())
          .get(`${BASE}?x-api-key=${KEYS.varios}`)
          .expect(401);
        expect(calledMethods()).toEqual([]);
      });

      it('401 también en ficha y descargas', async () => {
        for (const path of [
          '/1001',
          '/1001/attachments/att-1',
          '/1001/supervisions/1/findings/2/photos/p-1',
        ]) {
          await request(app.getHttpServer()).get(`${BASE}${path}`).expect(401);
        }
        expect(calledMethods()).toEqual([]);
      });

      it.each([
        ['sin configurar', ''],
        ['con una clave corta', 'agente:corta'],
        ['con una entrada inválida', `varios:${KEYS.varios},sinclave`],
      ])('503 %s, aunque la clave sea buena', async (_case, configured) => {
        const original = process.env.CLEANINGS_API_KEYS;
        process.env.CLEANINGS_API_KEYS = configured;
        try {
          await get(`${BASE}/1002`, KEYS.varios).expect(503);
        } finally {
          process.env.CLEANINGS_API_KEYS = original;
        }
        expect(calledMethods()).toEqual([]);
      });

      it.each(['post', 'put', 'patch', 'delete'] as const)(
        '404 con %s: la API es de solo lectura',
        async (method) => {
          for (const path of [
            BASE,
            `${BASE}/1003`,
            `${BASE}/1003/attachments/att-1`,
            `${BASE}/1003/supervisions/1/findings/2/photos/p-1`,
          ]) {
            await request(app.getHttpServer())
              [method](path)
              .set('x-api-key', KEYS.varios)
              .send({ phase: 'Completed' })
              .expect(404);
          }
          expect(calledMethods()).toEqual([]);
        },
      );
    });

    describe('listado', () => {
      it('200 con los campos del contrato, meta y nextOffset', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
          data: [taskCard(1102), taskCard(1101, { Unit: null })],
          meta: { total: 120 },
        });
        mocks.cleaningSupervisionsOpenmaint.findRecent.mockResolvedValue([
          supervisionCard(5102, 1102),
          supervisionCard(5101, 1102, { _Phase_code: 'Cancelled' }),
        ]);

        const res = await get(`${BASE}?limit=2`, KEYS.listado).expect(200);

        expect(res.body.meta).toEqual({
          total: 120,
          limit: 2,
          offset: 0,
          nextOffset: 2,
        });
        expect(res.body.data.map((item) => item.id)).toEqual([1102, 1101]);
        expect(res.body.data[0]).toEqual({
          id: 1102,
          type: 'CleaningTask',
          taskNumber: 'CT.2026.1102',
          description: 'Limpieza - R302',
          phase: 'Completed',
          isPaused: false,
          source: 'Hostaway',
          generatedDate: '2026-11-16',
          plannedStartTime: '2026-11-16T15:00:00Z',
          plannedEndTime: '2026-11-16T17:00:00Z',
          actualStartTime: '2026-11-16T15:05:00Z',
          actualEndTime: '2026-11-16T16:50:00Z',
          executionTime: 105,
          delayTime: 5,
          sessionStartedAt: null,
          sessionBaseMinutes: 0,
          taskObservations: 'Sin novedad',
          supervisionObserv: null,
          teamObservations: 'Nota 1: faltan toallas',
          hostawayReservation: 'R-4857692',
          hostawayListingId: '331',
          checkoutDate: '2026-11-16',
          unitId: 300,
          unit: {
            id: 300,
            code: 'R302',
            description: 'R302 - Estudio 02',
            name: 'Estudio 02',
            building: 'Pradera',
            buildingId: 3019998,
          },
          employee: { id: 4567, name: 'María López' },
          checklist: {
            id: EXECUTION_CHECKLIST,
            description: 'Checklist estudio',
          },
          // La más reciente de las dos.
          supervision: {
            id: 5102,
            phase: 'InCorrection',
            phaseLabel: 'En corrección',
            corrector: { id: 4567, name: 'María López' },
          },
          warnings: [],
        });
        expect(res.body.data[1]).toMatchObject({
          unitId: null,
          unit: null,
          supervision: null,
        });
        expect(res.headers['cache-control']).toBe('private, no-store');
        expectNoLeaks(res.body);
      });

      it('la última página no tiene nextOffset', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
          data: [taskCard(1111)],
          meta: { total: 101 },
        });

        const res = await get(`${BASE}?offset=100`, KEYS.listado).expect(200);

        expect(res.body.meta).toEqual({
          total: 101,
          limit: 50,
          offset: 100,
          nextOffset: null,
        });
      });

      it('sin total en la fuente: total null y sigue si la página vino llena', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
          data: [taskCard(1121)],
        });

        const res = await get(`${BASE}?limit=1&offset=7`, KEYS.listado).expect(
          200,
        );

        expect(res.body.meta).toEqual({
          total: null,
          limit: 1,
          offset: 7,
          nextOffset: 8,
        });
      });

      it('todos los filtros llegan a la fuente, en UTC y lo más nuevo primero', async () => {
        const query = new URLSearchParams({
          phase: 'Completed',
          date: '2026-11-16',
          plannedFrom: '2026-11-16T00:00:00-05:00',
          plannedTo: '2026-11-17T00:00:00-05:00',
          endedFrom: '2026-11-16T05:00:00Z',
          endedTo: '2026-11-17T05:00:00Z',
          employeeId: '4567',
          unitId: '300',
          limit: '10',
          offset: '20',
        });

        await get(`${BASE}?${query.toString()}`, KEYS.listado).expect(200);

        const { getAllTasks } = mocks.cleaningTasksOpenmaint;
        expect(getAllTasks).toHaveBeenCalledTimes(1);
        expect(getAllTasks).toHaveBeenCalledWith({
          phase: 'Completed',
          date: '2026-11-16',
          plannedFrom: '2026-11-16T05:00:00.000Z',
          plannedTo: '2026-11-17T05:00:00.000Z',
          endedFrom: '2026-11-16T05:00:00.000Z',
          endedTo: '2026-11-17T05:00:00.000Z',
          employeeId: 4567,
          unitId: 300,
          limit: 10,
          offset: 20,
          sort: 'newest',
        });
      });

      it.each([
        'fase=x',
        'phase=Completed&fase=x',
        'phase=Terminada',
        'phase=',
        'employeeId=0',
        'employeeId=',
        'employeeId=abc',
        'employeeId=1&employeeId=2',
        'unitId=-1',
        'limit=0',
        'limit=101',
        'offset=-1',
        'date=2026-02-31',
        'plannedFrom=2026-11-16',
        'endedFrom=2026-11-16T05:00:00',
        'endedFrom=2026-11-17T05:00:00Z&endedTo=2026-11-16T05:00:00Z',
      ])('400 con ?%s, sin llamar a la fuente', async (query) => {
        await get(`${BASE}?${query}`, KEYS.listado).expect(400);
        expect(calledMethods()).toEqual([]);
      });

      it('unidad ilegible: null con aviso, conservando unitId', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
          data: [taskCard(1131, { Unit: 399 })],
          meta: { total: 1 },
        });
        mocks.cleaningTasksOpenmaint.getUnitById.mockRejectedValue(
          upstreamError(500),
        );

        const res = await get(`${BASE}?unitId=399`, KEYS.listado).expect(200);

        expect(res.body.data[0]).toMatchObject({
          unitId: 399,
          unit: null,
          warnings: ['unit_unavailable'],
        });
      });

      it('502 si no se pueden leer las supervisiones: nunca supervision null', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
          data: [taskCard(1141)],
          meta: { total: 1 },
        });
        mocks.cleaningSupervisionsOpenmaint.findRecent.mockRejectedValue(
          upstreamError(500),
        );

        const res = await get(`${BASE}?unitId=1141`, KEYS.listado).expect(502);

        expectNoLeaks(res.body);
      });

      it('502 si la fuente responde sin listado', async () => {
        mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue(
          {} as { data: [] },
        );
        await get(`${BASE}?unitId=1151`, KEYS.listado).expect(502);
      });

      it('un fallo no se guarda en caché; el acierto sí', async () => {
        const { getAllTasks } = mocks.cleaningTasksOpenmaint;
        getAllTasks.mockRejectedValueOnce(upstreamError(500));
        const path = `${BASE}?unitId=1161`;

        await get(path, KEYS.listado).expect(502);
        await get(path, KEYS.listado).expect(200);
        await get(path, KEYS.listado).expect(200);

        expect(getAllTasks).toHaveBeenCalledTimes(2);
      });
    });

    describe('ficha', () => {
      it('200 completa: checklist, adjuntos y todas las supervisiones, sin campos internos', async () => {
        const id = 1201;
        const { cleaningTasksOpenmaint, cleaningSupervisionsOpenmaint } = mocks;
        cleaningTasksOpenmaint.getAttachmentsWithSession.mockResolvedValue({
          data: [
            attachment('att-op'),
            attachment('att-sup', { name: 'supervision_1.jpg' }),
          ],
        });
        cleaningSupervisionsOpenmaint.findByTask.mockResolvedValue([
          supervisionCard(5202, id),
          supervisionCard(5201, id, {
            _Phase_code: 'Approved',
            _Phase_description: 'Aprobada',
            Employee: null,
            Supervisor: null,
          }),
        ]);
        cleaningSupervisionsOpenmaint.listFindings.mockImplementation(
          (supervisionId: number) =>
            Promise.resolve(
              supervisionId === 5202
                ? [
                    finding(6202, { Index: 2, SolvedBySuperv: true }),
                    finding(6201),
                  ]
                : [],
            ),
        );
        cleaningSupervisionsOpenmaint.listFindingAttachments.mockImplementation(
          (findingId: number) =>
            Promise.resolve(
              findingId === 6201
                ? [
                    attachment('f-antes', { name: 'nov_1.jpg' }),
                    attachment('f-despues', { name: 'arr_1.jpg' }),
                  ]
                : [],
            ),
        );

        const res = await get(`${BASE}/${id}`, KEYS.ficha).expect(200);
        const { data } = res.body;

        expect(Object.keys(data as object).sort()).toEqual([
          'actualEndTime',
          'actualStartTime',
          'attachments',
          'cancelReason',
          'checklist',
          'checkoutDate',
          'delayTime',
          'description',
          'employee',
          'executionTime',
          'generatedDate',
          'hostawayListingId',
          'hostawayReservation',
          'id',
          'isPaused',
          'notes',
          'phase',
          'plannedEndTime',
          'plannedStartTime',
          'sessionBaseMinutes',
          'sessionStartedAt',
          'source',
          'supervision',
          'supervisionObserv',
          'supervisions',
          'taskNumber',
          'taskObservations',
          'teamObservations',
          'type',
          'unit',
          'unitId',
          'warnings',
        ]);
        expect(data).toMatchObject({
          id,
          phase: 'Completed',
          teamObservations: 'Nota 1: faltan toallas',
          cancelReason: null,
          notes: 'Nota de la coordinación',
          warnings: [],
          supervision: { id: 5202, phase: 'InCorrection' },
        });
        expect(data.checklist).toEqual({
          id: EXECUTION_CHECKLIST,
          code: 'EST',
          description: 'Checklist estudio',
          activities: ['Tender camas', 'Lavar vajilla'],
        });
        expect(data.attachments).toEqual([
          {
            id: 'att-op',
            fileName: 'att-op.jpg',
            category: 'Photo',
            description: null,
            origin: 'execution',
            uploadDate: '2026-11-16T16:00:00Z',
            downloadUrl: `${BASE}/${id}/attachments/att-op`,
          },
          {
            id: 'att-sup',
            fileName: 'supervision_1.jpg',
            category: 'Photo',
            description: null,
            origin: 'supervision',
            uploadDate: '2026-11-16T16:00:00Z',
            downloadUrl: `${BASE}/${id}/attachments/att-sup`,
          },
        ]);

        const photos = `${BASE}/${id}/supervisions/5202/findings/6201/photos`;
        expect(data.supervisions).toEqual([
          {
            id: 5202,
            phase: 'InCorrection',
            phaseLabel: 'En corrección',
            corrector: { id: 4567, name: 'María López' },
            supervisor: { id: 88, name: 'Ana Ruiz' },
            checklistId: SUPERVISION_CHECKLIST,
            findings: [
              {
                id: 6201,
                index: 1,
                point: {
                  area: 'Dormitorios',
                  name: 'Tendido de camas',
                  criterion: 'Sábanas estiradas',
                },
                subcategory: { id: 21, name: 'Manchas' },
                observation: 'Mancha en la sábana',
                resolvedBySupervisor: false,
                photos: [
                  {
                    id: 'f-antes',
                    fileName: 'nov_1.jpg',
                    uploadDate: '2026-11-16T16:00:00Z',
                    downloadUrl: `${photos}/f-antes`,
                  },
                ],
                fixPhotos: [
                  {
                    id: 'f-despues',
                    fileName: 'arr_1.jpg',
                    uploadDate: '2026-11-16T16:00:00Z',
                    downloadUrl: `${photos}/f-despues`,
                  },
                ],
              },
              expect.objectContaining({
                id: 6202,
                index: 2,
                resolvedBySupervisor: true,
                photos: [],
                fixPhotos: [],
              }),
            ],
          },
          {
            id: 5201,
            phase: 'Approved',
            phaseLabel: 'Aprobada',
            corrector: null,
            supervisor: null,
            checklistId: SUPERVISION_CHECKLIST,
            findings: [],
          },
        ]);
        expectNoLeaks(res.body);
      });

      it('las URLs de la ficha se pueden descargar tal cual', async () => {
        const { cleaningTasksOpenmaint, cleaningSupervisionsOpenmaint } = mocks;
        // Id con forma de Alfresco: `uuid;versión`.
        const fileId = '0f1e2d3c-aaaa-bbbb-cccc-1234567890ab;1.0';
        cleaningTasksOpenmaint.getAttachmentsWithSession.mockResolvedValue({
          data: [attachment(fileId)],
        });
        cleaningSupervisionsOpenmaint.findByTask.mockResolvedValue([
          supervisionCard(5203, 1203),
        ]);
        cleaningSupervisionsOpenmaint.listFindings.mockResolvedValue([
          finding(6203),
        ]);
        cleaningSupervisionsOpenmaint.listFindingAttachments.mockResolvedValue([
          attachment(fileId),
        ]);

        const { body } = await get(`${BASE}/1203`, KEYS.ficha).expect(200);
        const urls: string[] = [
          body.data.attachments[0].downloadUrl,
          body.data.supervisions[0].findings[0].photos[0].downloadUrl,
        ];
        for (const url of urls) await get(url, KEYS.ficha).expect(200);

        expect(
          cleaningTasksOpenmaint.downloadAttachmentWithSession,
        ).toHaveBeenCalledWith(
          1203,
          fileId,
          expect.objectContaining({ maxContentLength: 25 * 1024 * 1024 }),
        );
        expect(
          cleaningSupervisionsOpenmaint.downloadFindingAttachment,
        ).toHaveBeenCalledWith(
          6203,
          fileId,
          expect.objectContaining({ maxContentLength: 25 * 1024 * 1024 }),
        );
      });

      it('cancelReason solo en las canceladas', async () => {
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockResolvedValue({
          data: taskCard(1211, {
            _phase_description: 'Cancelled',
            Notes: 'Reserva anulada',
          }),
        });

        const res = await get(`${BASE}/1211`, KEYS.ficha).expect(200);

        expect(res.body.data).toMatchObject({
          phase: 'Cancelled',
          cancelReason: 'Reserva anulada',
        });
      });

      it('checklist ilegible: null con aviso', async () => {
        mocks.cleaningTasksOpenmaint.getCleaningActivity.mockRejectedValue(
          upstreamError(500),
        );

        const res = await get(`${BASE}/1212`, KEYS.ficha).expect(200);

        expect(res.body.data.checklist).toBeNull();
        expect(res.body.data.warnings).toEqual(['checklist_unavailable']);
      });

      it.each([
        ['la fuente responde 404', 1221, upstreamError(404)],
        ['la fuente responde 400', 1222, upstreamError(400)],
        ['la fuente no trae la tarjeta', 1223, null],
      ])('404 si %s', async (_case, id, error) => {
        const { getTaskByIdWithSession } = mocks.cleaningTasksOpenmaint;
        if (error) getTaskByIdWithSession.mockRejectedValue(error);
        else getTaskByIdWithSession.mockResolvedValue({});

        const res = await get(`${BASE}/${id}`, KEYS.ficha).expect(404);

        expectNoLeaks(res.body);
      });

      it.each(['0', '-1', 'abc', '1.5', '1..%2F2', '..%2F..%2Fsessions'])(
        '400 con id %s, sin llamar a la fuente',
        async (id) => {
          await get(`${BASE}/${id}`, KEYS.ficha).expect(400);
          expect(calledMethods()).toEqual([]);
        },
      );

      it('400 con cualquier parámetro de consulta', async () => {
        await get(`${BASE}/1231?expand=all`, KEYS.ficha).expect(400);
        expect(calledMethods()).toEqual([]);
      });

      it('502 si fallan los adjuntos: nunca lista vacía ni nombra la fuente', async () => {
        mocks.cleaningTasksOpenmaint.getAttachmentsWithSession.mockRejectedValue(
          upstreamError(500),
        );

        const res = await get(`${BASE}/1241`, KEYS.ficha).expect(502);

        expect(res.body.data).toBeUndefined();
        expectNoLeaks(res.body);
      });

      it('502 si los adjuntos llegan sin listado', async () => {
        mocks.cleaningTasksOpenmaint.getAttachmentsWithSession.mockResolvedValue(
          { success: true },
        );
        await get(`${BASE}/1242`, KEYS.ficha).expect(502);
      });

      it.each([
        ['las supervisiones', 1243, 'findByTask'],
        ['las novedades', 1244, 'listFindings'],
        ['las fotos de una novedad', 1245, 'listFindingAttachments'],
      ] as const)('502 si fallan %s', async (_case, id, method) => {
        const gateway = mocks.cleaningSupervisionsOpenmaint;
        gateway.findByTask.mockResolvedValue([supervisionCard(5245, id)]);
        gateway.listFindings.mockResolvedValue([finding(6245)]);
        gateway[method].mockRejectedValue(upstreamError(500));

        const res = await get(`${BASE}/${id}`, KEYS.ficha).expect(502);

        expectNoLeaks(res.body);
      });

      it('503 en enfriamiento, en todas las rutas y sin llamar a la fuente', async () => {
        isCoolingDown.mockReturnValue(true);

        for (const path of [
          '?unitId=1251',
          '/1251',
          '/1251/attachments/att-1',
          '/1251/supervisions/1/findings/2/photos/p-1',
        ]) {
          const res = await get(`${BASE}${path}`, KEYS.ficha).expect(503);
          expectNoLeaks(res.body);
        }

        expect(getSessionId).not.toHaveBeenCalled();
        expect(calledMethods()).toEqual([]);
      });

      it('503 sin sesión de servicio, sin llamar a la fuente', async () => {
        getSessionId.mockResolvedValue('');

        const res = await get(`${BASE}/1252`, KEYS.ficha).expect(503);

        expectNoLeaks(res.body);
        expect(calledMethods()).toEqual([]);
      });
    });

    describe('descargas', () => {
      const photoPath = (
        id: number,
        supervisionId: number,
        findingId: number,
        photoId: string,
      ) =>
        `${BASE}/${id}/supervisions/${supervisionId}/findings/${findingId}/photos/${photoId}`;

      // Cada limpieza con lo suyo: 13xx → supervisión 53xx → novedad 63xx → foto-63xx.
      beforeEach(() => {
        const supervisions = mocks.cleaningSupervisionsOpenmaint;
        mocks.cleaningTasksOpenmaint.getAttachmentsWithSession.mockImplementation(
          (id: number) =>
            Promise.resolve({
              data: [attachment(`att-${id}`, { name: 'baño "1".jpg' })],
            }),
        );
        supervisions.findByTask.mockImplementation((id: number) =>
          Promise.resolve([supervisionCard(id + 4000, id)]),
        );
        supervisions.listFindings.mockImplementation((id: number) =>
          Promise.resolve([finding(id + 1000)]),
        );
        supervisions.listFindingAttachments.mockImplementation((id: number) =>
          Promise.resolve([attachment(`foto-${id}`, { name: 'nov_1.jpg' })]),
        );
      });

      it('archivo de la limpieza con sus cabeceras', async () => {
        const res = await get(
          `${BASE}/1301/attachments/att-1301`,
          KEYS.archivos,
        ).expect(200);

        expect(res.body).toEqual(Buffer.from('foto-limpieza'));
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['content-length']).toBe('13');
        // El nombre sale del listado, no de la descarga.
        expect(res.headers['content-disposition']).toBe(
          "attachment; filename*=UTF-8''ba%C3%B1o%20%221%22.jpg",
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(
          mocks.cleaningTasksOpenmaint.downloadAttachmentWithSession,
        ).toHaveBeenCalledWith(
          1301,
          'att-1301',
          expect.objectContaining({ maxContentLength: 25 * 1024 * 1024 }),
        );
      });

      it('foto de una novedad con sus cabeceras', async () => {
        const res = await get(
          photoPath(1302, 5302, 6302, 'foto-6302'),
          KEYS.archivos,
        ).expect(200);

        expect(res.body).toEqual(Buffer.from('foto-novedad'));
        expect(res.headers['content-type']).toBe('image/jpeg');
        expect(res.headers['content-disposition']).toBe(
          "attachment; filename*=UTF-8''nov_1.jpg",
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(
          mocks.cleaningSupervisionsOpenmaint.downloadFindingAttachment,
        ).toHaveBeenCalledWith(
          6302,
          'foto-6302',
          expect.objectContaining({ maxContentLength: 25 * 1024 * 1024 }),
        );
      });

      it('un tipo fuera de la lista blanca sale como octet-stream', async () => {
        mocks.cleaningTasksOpenmaint.downloadAttachmentWithSession.mockResolvedValue(
          {
            data: Buffer.from('<script>1</script>'),
            contentType: 'text/html; charset=utf-8',
            fileName: 'x.html',
          },
        );

        const res = await get(
          `${BASE}/1303/attachments/att-1303`,
          KEYS.archivos,
        ).expect(200);

        expect(res.headers['content-type']).toBe('application/octet-stream');
      });

      it.each([
        ['archivo de otra limpieza', `${BASE}/1311/attachments/att-1312`],
        ['foto de otra limpieza', photoPath(1311, 5312, 6312, 'foto-6312')],
        [
          'novedad de otra supervisión',
          photoPath(1311, 5311, 6312, 'foto-6312'),
        ],
        ['foto de otra novedad', photoPath(1311, 5311, 6311, 'foto-6312')],
      ])('404 con %s, sin descargar', async (_case, path) => {
        await get(path, KEYS.archivos).expect(404);

        expect(
          calledMethods().filter((name) => name.startsWith('download')),
        ).toEqual([]);
      });

      it('404 si la limpieza no existe, sin leer sus archivos', async () => {
        mocks.cleaningTasksOpenmaint.getTaskByIdWithSession.mockRejectedValue(
          upstreamError(404),
        );

        await get(`${BASE}/1321/attachments/att-1321`, KEYS.archivos).expect(
          404,
        );

        expect(calledMethods()).toEqual(['getTaskByIdWithSession']);
      });

      it.each([
        '..%2F..%2Fsessions',
        '..%2Fatt-1331',
        'att-1331%2F..%2Fotro',
        '..%5Csessions',
        'att%00',
        'att%3Fx=1',
        '%252e%252e%252fsessions',
        'att..1331',
      ])('400 con id de archivo %s, sin llamar a la fuente', async (id) => {
        for (const path of [
          `${BASE}/1331/attachments/${id}`,
          photoPath(1331, 5331, 6331, id),
        ]) {
          await get(path, KEYS.archivos).expect(400);
        }
        expect(calledMethods()).toEqual([]);
      });

      it('502 si falla la descarga, sin nombrar la fuente', async () => {
        mocks.cleaningTasksOpenmaint.downloadAttachmentWithSession.mockRejectedValue(
          upstreamError(500),
        );

        const res = await get(
          `${BASE}/1341/attachments/att-1341`,
          KEYS.archivos,
        ).expect(502);

        expectNoLeaks(res.body);
      });
    });

    describe('cupos', () => {
      it('429 con Retry-After al agotar el cupo, sin afectar a otro cliente', async () => {
        const path = `${BASE}?unitId=1401`;
        for (let i = 0; i < 60; i += 1) {
          await get(path, KEYS.cupo).expect(200);
        }

        const res = await get(path, KEYS.cupo).expect(429);

        expect(res.headers['retry-after']).toBe('60');
        await get(path, KEYS.varios).expect(200);
        // Las 61 respuestas correctas salieron de una sola lectura.
        expect(mocks.cleaningTasksOpenmaint.getAllTasks).toHaveBeenCalledTimes(
          1,
        );
      });

      // El último: deja agotado el límite de claves inválidas de esta IP.
      it('429 con demasiadas claves inválidas, sin bloquear a una válida', async () => {
        let res = await get(BASE, 'mala-'.padEnd(40, 'x')).expect(401);
        for (let i = 0; i < 20 && res.status === 401; i += 1) {
          res = await get(BASE, `mala-${i}`.padEnd(40, 'x'));
        }

        expect(res.status).toBe(429);
        expect(res.headers['retry-after']).toBe('60');
        await get(`${BASE}?unitId=1402`, KEYS.varios).expect(200);
      });
    });
  });

  describe('/cleaning-tasks sigue igual', () => {
    beforeEach(() => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'SupervisorLimpieza' }),
      );
    });

    it('GET /cleaning-tasks responde sin clave, con la misma forma', async () => {
      const { getCleaningTasks } = mocks.cleaningTasksOpenmaint;
      getCleaningTasks.mockResolvedValueOnce({ data: [taskCard(1501)] });

      const res = await request(app.getHttpServer())
        .get('/cleaning-tasks?date=2026-11-16')
        .expect(200);

      expect(getCleaningTasks).toHaveBeenCalledWith('2026-11-16');
      expect(res.body).toEqual({
        tasks: [
          {
            id: 1501,
            taskNumber: 'CT.2026.1501',
            phase: 'Completed',
            unit: 'R302',
            employee: 'María López',
            plannedStartTime: '2026-11-16T15:00:00Z',
            plannedEndTime: '2026-11-16T17:00:00Z',
            actualStartTime: '2026-11-16T15:05:00Z',
            actualEndTime: '2026-11-16T16:50:00Z',
            executionTime: 105,
            delayTime: 5,
            taskObservations: 'Sin novedad',
            supervisionObserv: null,
            teamObservations: 'Nota 1: faltan toallas',
            isPaused: false,
            sessionStartedAt: null,
            sessionBaseMinutes: 0,
            hostawayReservationId: 'R-4857692',
            hostawayListingId: '331',
            checkoutDate: '2026-11-16',
            source: 'Hostaway',
            generatedDate: '2026-11-16',
          },
        ],
      });
    });

    it('GET /cleaning-tasks/all responde con la sesión, sin caché ni filtros nuevos', async () => {
      const { getAllTasks } = mocks.cleaningTasksOpenmaint;
      getAllTasks.mockResolvedValue({
        data: [taskCard(1511)],
        meta: { total: 1 },
      });
      const all = () =>
        request(app.getHttpServer())
          .get('/cleaning-tasks/all?limit=5&unitId=300&desconocido=x')
          .set('x-session-token', 'mock-session-token')
          .expect(200);

      const res = await all();
      await all();

      expect(res.body).toMatchObject({
        success: true,
        data: [{ id: 1511, phase: 'Completed', supervision: null }],
        meta: { total: 1, limit: 5, offset: 0 },
      });
      expect(res.body.data[0]).not.toHaveProperty('unitId');
      expect(getAllTasks).toHaveBeenCalledTimes(2);
      for (const [options] of getAllTasks.mock.calls) {
        expect(options).toMatchObject({ limit: 5 });
        expect(options).not.toHaveProperty('unitId');
      }
    });

    it('GET /cleaning-tasks/all sigue tolerando un fallo de supervisiones', async () => {
      mocks.cleaningTasksOpenmaint.getAllTasks.mockResolvedValue({
        data: [taskCard(1521)],
        meta: { total: 1 },
      });
      mocks.cleaningSupervisionsOpenmaint.findRecent.mockRejectedValue(
        upstreamError(500),
      );

      const res = await request(app.getHttpServer())
        .get('/cleaning-tasks/all')
        .set('x-session-token', 'mock-session-token')
        .expect(200);

      expect(res.body.data[0].supervision).toBeNull();
    });

    it('la clave de la API no abre /cleaning-tasks/all', async () => {
      await get('/cleaning-tasks/all', KEYS.varios).expect(401);
      expect(mocks.cleaningTasksOpenmaint.getAllTasks).not.toHaveBeenCalled();
    });
  });
});
