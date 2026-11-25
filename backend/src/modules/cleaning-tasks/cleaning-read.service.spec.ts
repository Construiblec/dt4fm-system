import {
  BadGatewayException,
  GatewayTimeoutException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CleaningReadService } from './cleaning-read.service';
import { CleaningSupervisionsOpenmaintService } from './cleaning-supervisions.openmaint.service';
import { CleaningSupervisionsService } from './cleaning-supervisions.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import { CleaningTasksService } from './cleaning-tasks.service';

type Row = Record<string, unknown>;
type Route = [RegExp, unknown];

const TASK = {
  _id: 10,
  _type: 'CleaningTask',
  TaskNumber: 'CT.2026.0010',
  Description: 'Salida',
  phase: 2216396,
  _phase_description: 'Completed',
  GeneratedDate: '2026-11-20',
  PlannedStartTime: '2026-11-20T15:00:00Z',
  ActualEndTime: '2026-11-20T17:00:00Z',
  TeamObservations: 'Nota 1: todo bien\n\n{borrador secreto}',
  Notes: 'motivo',
  Unit: 5,
  Employee: 77,
  _Employee_description: 'Ana',
  CleaningChecklist: 40,
  _CleaningChecklist_description: 'Aseo',
  _Source_description: 'Manual',
  CampoNuevo: 'no debe salir',
};
const UNIT = {
  _id: 5,
  Code: 'U5',
  Name: 'Suite 5',
  Building: 3,
  _Building_description: 'Torre',
};
const SUPERVISION = {
  _id: 200,
  CleaningTask: 10,
  Phase: 999,
  _Phase_code: 'InCorrection',
  _Phase_description: 'En corrección',
  Employee: 78,
  _Employee_description: 'Luis',
  Supervisor: 79,
  _Supervisor_description: 'Eva',
  Checklist: 41,
};
const PHOTO = {
  _id: 'foto-1',
  name: 'nov_1.jpg',
  author: 'svc',
  created: '2026-11-20T18:00:00Z',
};
const FIX_PHOTO = { _id: 'foto-2', name: 'arr_1.jpg', author: 'svc' };
const ATTACHMENT = {
  _id: 'adj 1',
  name: 'supervision_x.jpg',
  fileName: '',
  category: '390625',
  _category_description: 'Photo',
  author: 'svc',
  created: '2026-11-20T17:30:00Z',
};
const FINDINGS = [
  { _id: 301, Supervision: 200, Index: 2, Subcategory: 8 },
  {
    _id: 300,
    Supervision: 200,
    Index: 1,
    Subcategory: 9,
    _Subcategory_description: 'Polvo',
    Observation: 'en mesa',
    SolvedBySuperv: true,
  },
];
const SUPERVISION_CSV =
  'area;guia_area;nombre_item;descripcion_criterio\nDorm;g;Cama;Tendida\nBaño;g;Espejo;Limpio';

const upstream = (status: number) =>
  Object.assign(new Error(`OpenMAINT ${status}`), { response: { status } });

/** Rutas por defecto; las del caso van antes y ganan. */
const defaultRoutes: Route[] = [
  [/CleaningTask\/cards\?/, { data: [TASK], meta: { total: 31 } }],
  [/CleaningTask\/cards\/10$/, { data: TASK }],
  [/CleaningTask\/cards\/10\/attachments$/, { data: [ATTACHMENT] }],
  [/CleaningSupervision\/cards/, { data: [SUPERVISION] }],
  [/CleaningFinding\/cards\?/, { data: FINDINGS }],
  [/CleaningFinding\/cards\/300\/attachments$/, { data: [PHOTO, FIX_PHOTO] }],
  [/CleaningFinding\/cards\/301\/attachments$/, { data: [] }],
  [/Unit\/cards\/5$/, { data: UNIT }],
  [
    /CleaningActivity\/cards\/40$/,
    {
      data: {
        _id: 40,
        Code: 'A',
        Description: 'Aseo',
        Detalle: 'a,b,1\nc,d,2',
      },
    },
  ],
  [
    /CleaningActivity\/cards\/41$/,
    { data: { _id: 41, Detalle: SUPERVISION_CSV } },
  ],
  [/CleaningTask\/cards\/\d+(\/attachments)?$/, upstream(404)],
];

/** Servicios reales sobre un cliente HTTP simulado. */
const build = (routes: Route[] = []) => {
  const all = [...routes, ...defaultRoutes];
  const get = jest.fn(async (path: string): Promise<unknown> => {
    await Promise.resolve();
    const route = all.find(([pattern]) => pattern.test(path));
    if (!route) throw new Error(`ruta no simulada: ${path}`);
    const answer: unknown =
      typeof route[1] === 'function'
        ? await (route[1] as (path: string) => unknown)(path)
        : route[1];
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const getBuffer = jest.fn().mockResolvedValue({
    data: Buffer.from('img'),
    contentType: 'image/jpeg',
    fileName: 'interno.bin',
  });
  const client = {
    get,
    getBuffer,
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    postFormData: jest.fn(),
  };
  const session = {
    getSessionId: jest.fn().mockResolvedValue('session'),
    refreshSession: jest.fn(),
    isCoolingDown: jest.fn().mockReturnValue(false),
  };
  const unused = {} as never;
  const tasksGateway = new CleaningTasksOpenmaintService(
    client as never,
    session as never,
  );
  const supervisionsGateway = new CleaningSupervisionsOpenmaintService(
    client as never,
    session as never,
  );
  const supervisions = new CleaningSupervisionsService(
    supervisionsGateway,
    tasksGateway,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
  const tasks = new CleaningTasksService(
    unused,
    tasksGateway,
    unused,
    unused,
    supervisions,
    unused,
  );
  const service = new CleaningReadService(
    tasks,
    tasksGateway,
    supervisions,
    supervisionsGateway,
    session as never,
  );
  const paths = () => get.mock.calls.map(([path]) => path);
  return { service, client, session, get, getBuffer, paths };
};

const page = { limit: 50, offset: 0 };

const expectBadGateway = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BadGatewayException);
  expect((error as Error).message).not.toMatch(/openmaint|\/classes/i);
};

describe('CleaningReadService', () => {
  beforeEach(() => {
    for (const level of ['error', 'warn', 'log', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation();
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('list', () => {
    it('proyecta cada limpieza con su unidad y su última supervisión', async () => {
      const { service, paths } = build([
        [
          /CleaningSupervision\/cards/,
          {
            data: [
              SUPERVISION,
              { ...SUPERVISION, _id: 150, _Phase_code: 'Approved' },
            ],
          },
        ],
      ]);

      const { items, total } = await service.list({ ...page, unitId: 5 });

      expect(total).toBe(31);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 10,
        phase: 'Completed',
        teamObservations: 'Nota 1: todo bien',
        unitId: 5,
        unit: { id: 5, building: 'Torre', buildingId: 3 },
        employee: { id: 77, name: 'Ana' },
        checklist: { id: 40, description: 'Aseo' },
        supervision: {
          id: 200,
          phase: 'InCorrection',
          phaseLabel: 'En corrección',
          corrector: { id: 78, name: 'Luis' },
        },
        warnings: [],
      });
      const path = paths().find((p) => p.includes('CleaningTask/')) ?? '';
      expect(path).toContain('sort=');
      expect(decodeURIComponent(path)).toContain('"attribute":"Unit"');
    });

    it.each([
      [true, 'isnotnull'],
      [false, 'isnull'],
    ])(
      'checkoutDate y assigned=%j llegan a la fuente',
      async (assigned, operator) => {
        const { service, paths } = build();

        await service.list({ ...page, checkoutDate: '2026-11-26', assigned });

        const path = decodeURIComponent(
          paths().find((p) => p.includes('CleaningTask/')) ?? '',
        );
        expect(path).toContain(
          '{"attribute":"CheckoutDate","operator":"equal","value":"2026-11-26"}',
        );
        expect(path).toContain(
          `{"attribute":"Employee","operator":"${operator}"}`,
        );
      },
    );

    it('sin esos filtros no se filtra por ellos', async () => {
      const { service, paths } = build();

      await service.list(page);

      const path = paths().find((p) => p.includes('CleaningTask/'));
      expect(path).not.toContain('filter=');
    });

    it('no saca campos que no estén en el contrato', async () => {
      const { items } = await build().service.list(page);

      expect(Object.keys(items[0]).sort()).toEqual(
        [
          'id',
          'type',
          'taskNumber',
          'description',
          'phase',
          'isPaused',
          'source',
          'generatedDate',
          'plannedStartTime',
          'plannedEndTime',
          'actualStartTime',
          'actualEndTime',
          'executionTime',
          'delayTime',
          'sessionStartedAt',
          'sessionBaseMinutes',
          'taskObservations',
          'supervisionObserv',
          'teamObservations',
          'hostawayReservation',
          'hostawayListingId',
          'checkoutDate',
          'unitId',
          'unit',
          'employee',
          'checklist',
          'supervision',
          'warnings',
        ].sort(),
      );
    });

    it('sin total de la fuente, total es null', async () => {
      const { service } = build([[/CleaningTask\/cards\?/, { data: [] }]]);

      await expect(service.list(page)).resolves.toEqual({
        items: [],
        total: null,
      });
    });

    it('respuesta sin listado => 502, no un listado vacío', async () => {
      const { service } = build([[/CleaningTask\/cards\?/, {}]]);

      await expectBadGateway(service.list(page));
    });

    it('si no se pueden leer las supervisiones => 502', async () => {
      const { service } = build([
        [/CleaningSupervision\/cards/, upstream(500)],
      ]);

      await expectBadGateway(service.list(page));
    });

    it('si no se pueden leer las limpiezas => 502', async () => {
      const { service } = build([[/CleaningTask\/cards\?/, upstream(500)]]);

      await expectBadGateway(service.list(page));
    });

    it('unidad ilegible => unit null con aviso, leída una sola vez', async () => {
      const { service, paths } = build([
        [
          /CleaningTask\/cards\?/,
          { data: [TASK, { ...TASK, _id: 11 }, { ...TASK, _id: 12, Unit: 6 }] },
        ],
        [/Unit\/cards\/5$/, upstream(500)],
        [/Unit\/cards\/6$/, { data: { ...UNIT, _id: 6 } }],
      ]);

      const { items } = await service.list(page);

      expect(
        items.map((i) => [i.id, i.unitId, i.unit?.id, i.warnings]),
      ).toEqual([
        [10, 5, undefined, ['unit_unavailable']],
        [11, 5, undefined, ['unit_unavailable']],
        [12, 6, 6, []],
      ]);
      expect(paths().filter((p) => p.endsWith('/Unit/cards/5'))).toHaveLength(
        1,
      );
    });

    it('sin unidad asignada no hay aviso', async () => {
      const { service } = build([
        [/CleaningTask\/cards\?/, { data: [{ ...TASK, Unit: null }] }],
      ]);

      const { items } = await service.list(page);

      expect(items[0]).toMatchObject({
        unitId: null,
        unit: null,
        warnings: [],
      });
    });

    const recent = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        ...SUPERVISION,
        _id: 5000 - i,
        CleaningTask: 9000 + i,
      }));

    it('con 500 supervisiones recientes completa las que falten por limpieza', async () => {
      const { service, paths } = build([
        [
          /CleaningTask\/cards\?/,
          { data: [TASK, { ...TASK, _id: 9000 }, { ...TASK, _id: 12 }] },
        ],
        [
          /CleaningSupervision\/cards\?limit=500&sort=[^&]*$/,
          { data: recent(500) },
        ],
        [
          /CleaningSupervision\/cards.*filter=/,
          (path: string) => ({
            data: decodeURIComponent(path).includes('"value":[10]')
              ? [SUPERVISION]
              : [],
          }),
        ],
      ]);

      const { items } = await service.list(page);

      expect(items.map((i) => i.supervision?.id ?? null)).toEqual([
        200,
        5000,
        null,
      ]);
      expect(
        paths().filter((p) => /CleaningSupervision.*filter=/.test(p)),
      ).toHaveLength(2);
    });

    it('con menos de 500 no hace lecturas extra', async () => {
      const { service, paths } = build([
        [/CleaningSupervision\/cards/, { data: recent(499) }],
      ]);

      const { items } = await service.list(page);

      expect(items[0].supervision).toBeNull();
      expect(
        paths().filter((p) => p.includes('CleaningSupervision')),
      ).toHaveLength(1);
    });

    it('nunca hay más de 5 lecturas a la vez', async () => {
      let active = 0;
      let max = 0;
      const slow =
        (answer: (path: string) => unknown) => async (path: string) => {
          max = Math.max(max, ++active);
          await new Promise((resolve) => setImmediate(resolve));
          active--;
          return answer(path);
        };
      const tasks = Array.from({ length: 30 }, (_, i) => ({
        ...TASK,
        _id: 100 + i,
        Unit: 500 + i,
      }));
      const { service, get } = build([
        [/CleaningTask\/cards\?/, { data: tasks }],
        [
          /CleaningSupervision\/cards\?limit=500&sort=[^&]*$/,
          { data: recent(500) },
        ],
        [/CleaningSupervision\/cards.*filter=/, slow(() => ({ data: [] }))],
        [
          /Unit\/cards\/\d+$/,
          slow((path) => ({
            data: { ...UNIT, _id: Number(path.split('/').pop()) },
          })),
        ],
      ]);

      const { items } = await service.list(page);

      expect(items.every((i) => i.unit?.id === i.unitId)).toBe(true);
      expect(get).toHaveBeenCalledTimes(62);
      expect(max).toBe(5);
    });
  });

  describe('item', () => {
    it('sale igual que en el listado', async () => {
      const { items } = await build().service.list(page);

      await expect(build().service.item(10)).resolves.toEqual(items[0]);
    });

    it('lee la tarjeta y solo las supervisiones de esa limpieza', async () => {
      const { service, paths } = build();

      await service.item(10);

      expect(paths()[0]).toBe('/classes/CleaningTask/cards/10');
      const supervisions = paths().filter((p) =>
        p.includes('CleaningSupervision'),
      );
      expect(supervisions).toHaveLength(1);
      expect(decodeURIComponent(supervisions[0])).toContain('"value":[10]');
    });

    it('sin supervisiones => null; sin unidad legible => aviso', async () => {
      const { service } = build([
        [/CleaningSupervision\/cards/, { data: [] }],
        [/Unit\/cards\/5$/, upstream(500)],
      ]);

      await expect(service.item(10)).resolves.toMatchObject({
        supervision: null,
        unit: null,
        warnings: ['unit_unavailable'],
      });
    });

    it.each([404, 400])('la fuente responde %i => 404', async (status) => {
      const { service } = build([
        [/CleaningTask\/cards\/10$/, upstream(status)],
      ]);
      await expect(service.item(10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tarjeta vacía => 404', async () => {
      const { service } = build([[/CleaningTask\/cards\/10$/, { data: null }]]);
      await expect(service.item(10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([/CleaningTask\/cards\/10$/, /CleaningSupervision\/cards/])(
      'fallo en %s => 502',
      async (route) => {
        await expectBadGateway(
          build([[route, upstream(500)]]).service.item(10),
        );
      },
    );

    it('supervisiones sin listado => 502, no null', async () => {
      await expectBadGateway(
        build([[/CleaningSupervision\/cards/, {}]]).service.item(10),
      );
    });
  });

  describe('fallos que no pasan por vacío', () => {
    const EMPTY_BODIES = ['', '<html></html>', { success: false }];

    it.each(EMPTY_BODIES)(
      'supervisiones sin listado (%j) => 502',
      async (b) => {
        const { service } = build([[/CleaningSupervision\/cards/, b]]);
        await expectBadGateway(service.list(page));
        await expectBadGateway(service.detail(10));
      },
    );

    it.each(EMPTY_BODIES)('novedades sin listado (%j) => 502', async (b) => {
      const { service } = build([[/CleaningFinding\/cards\?/, b]]);
      await expectBadGateway(service.detail(10));
    });

    it.each(EMPTY_BODIES)('fotos sin listado (%j) => 502', async (b) => {
      const { service } = build([[/CleaningFinding\/cards\/300\/att/, b]]);
      await expectBadGateway(service.detail(10));
      await expectBadGateway(service.findingPhoto(10, 200, 300, 'foto-1'));
    });

    it('un 404 con HTML es del proxy => 502', async () => {
      const error = Object.assign(new Error('x'), {
        response: { status: 404, data: '<html>' },
      });
      const { service } = build([[/CleaningTask\/cards\/10$/, error]]);
      await expectBadGateway(service.detail(10));
    });

    it.each([
      [2216396, 'Completed'],
      [999, 'Unknown'],
    ])('la fase %i sale como %s', async (phase, expected) => {
      const card = { ...TASK, phase, _phase_description: undefined };
      const { service } = build([[/CleaningTask\/cards\/10$/, { data: card }]]);
      expect((await service.detail(10)).phase).toBe(expected);
    });
  });

  describe('cupo de consultas a la vez', () => {
    it('la cuarta descarga simultánea da 503 y al terminar se libera', async () => {
      let finish: () => void = () => undefined;
      const { service, getBuffer } = build();
      getBuffer.mockImplementation(
        () =>
          new Promise((resolve) => {
            const previous = finish;
            finish = () => {
              previous();
              resolve({ data: Buffer.from('i'), contentType: 'image/png' });
            };
          }),
      );
      const running = [1, 2, 3].map(() => service.attachment(10, 'adj 1'));
      await expect(service.attachment(10, 'adj 1')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // Las lecturas tienen su propio cupo.
      await expect(service.list(page)).resolves.toBeDefined();

      while (getBuffer.mock.calls.length < 3) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      finish();
      await Promise.all(running);
      getBuffer.mockResolvedValue({ data: Buffer.from('i'), contentType: 'x' });
      await expect(service.attachment(10, 'adj 1')).resolves.toBeDefined();
    });

    it('un error también libera el cupo', async () => {
      const { service, getBuffer } = build();
      getBuffer.mockRejectedValue(new Error('caída'));
      for (let i = 0; i < 5; i++) {
        await expectBadGateway(service.attachment(10, 'adj 1'));
      }
    });
  });

  describe('detail', () => {
    it('arma la ficha completa', async () => {
      const detail = await build().service.detail(10);

      expect(detail).toMatchObject({
        id: 10,
        cancelReason: null,
        notes: 'motivo',
        unit: { id: 5 },
        checklist: {
          id: 40,
          code: 'A',
          description: 'Aseo',
          activities: ['a,b,1', 'c,d,2'],
        },
        supervision: { id: 200, phase: 'InCorrection' },
        warnings: [],
      });
      expect(detail.attachments).toEqual([
        {
          id: 'adj 1',
          fileName: 'supervision_x.jpg',
          category: 'Photo',
          description: null,
          origin: 'supervision',
          uploadDate: '2026-11-20T17:30:00Z',
          downloadUrl: '/integrations/v1/cleanings/10/attachments/adj%201',
        },
      ]);
      expect(detail.supervisions).toEqual([
        {
          id: 200,
          phase: 'InCorrection',
          phaseLabel: 'En corrección',
          corrector: { id: 78, name: 'Luis' },
          supervisor: { id: 79, name: 'Eva' },
          checklistId: 41,
          findings: [
            {
              id: 300,
              index: 1,
              point: { area: 'Dorm', name: 'Cama', criterion: 'Tendida' },
              subcategory: { id: 9, name: 'Polvo' },
              observation: 'en mesa',
              resolvedBySupervisor: true,
              photos: [
                {
                  id: 'foto-1',
                  fileName: 'nov_1.jpg',
                  uploadDate: '2026-11-20T18:00:00Z',
                  downloadUrl:
                    '/integrations/v1/cleanings/10/supervisions/200/findings/300/photos/foto-1',
                },
              ],
              fixPhotos: [
                {
                  id: 'foto-2',
                  fileName: 'arr_1.jpg',
                  uploadDate: null,
                  downloadUrl:
                    '/integrations/v1/cleanings/10/supervisions/200/findings/300/photos/foto-2',
                },
              ],
            },
            {
              id: 301,
              index: 2,
              point: { area: 'Baño', name: 'Espejo', criterion: 'Limpio' },
              subcategory: { id: 8, name: null },
              observation: null,
              resolvedBySupervisor: false,
              photos: [],
              fixPhotos: [],
            },
          ],
        },
      ]);
    });

    it('cancelReason solo sale en las canceladas', async () => {
      const { service } = build([
        [
          /CleaningTask\/cards\/10$/,
          { data: { ...TASK, _phase_description: 'Cancelled' } },
        ],
      ]);

      expect(await service.detail(10)).toMatchObject({
        cancelReason: 'motivo',
        notes: 'motivo',
      });
    });

    it('no expone borradores, permisos, autores ni lookups internos', async () => {
      const json = JSON.stringify(
        await build([
          [
            /CleaningTask\/cards\/10\/attachments$/,
            { data: [{ ...ATTACHMENT, _category_description: undefined }] },
          ],
        ]).service.detail(10),
      );

      expect(json).not.toMatch(
        /draftObservations|borrador secreto|"can[A-Z]|"can"|author|phaseId|CampoNuevo|390625|2216396|\/cleaning-tasks|\/classes/,
      );
    });

    it.each([404, 400])('la fuente responde %i => 404', async (status) => {
      const { service } = build([
        [/CleaningTask\/cards\/10$/, upstream(status)],
      ]);

      await expect(service.detail(10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('tarjeta vacía => 404', async () => {
      const { service } = build([[/CleaningTask\/cards\/10$/, { data: null }]]);

      await expect(service.detail(10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      ['la limpieza', /CleaningTask\/cards\/10$/, upstream(500)],
      ['los adjuntos', /cards\/10\/attachments$/, upstream(500)],
      ['los adjuntos (404)', /cards\/10\/attachments$/, upstream(404)],
      ['los adjuntos (sin listado)', /cards\/10\/attachments$/, {}],
      ['las supervisiones', /CleaningSupervision\/cards/, upstream(500)],
      ['las novedades', /CleaningFinding\/cards\?/, upstream(500)],
      ['las fotos', /CleaningFinding\/cards\/300/, upstream(500)],
    ])('si falla la lectura de %s => 502', async (_, pattern, answer) => {
      await expectBadGateway(build([[pattern, answer]]).service.detail(10));
    });

    it('checklist ilegible => null con aviso', async () => {
      const { service } = build([
        [/CleaningActivity\/cards\/40$/, upstream(500)],
        [/CleaningActivity\/cards\?/, upstream(500)],
      ]);

      await expect(service.detail(10)).resolves.toMatchObject({
        checklist: null,
        warnings: ['checklist_unavailable'],
      });
    });

    it('checklist con el archivo roto => filas de respaldo con aviso', async () => {
      const { service } = build([
        [/CleaningActivity\/cards\/40$/, upstream(500)],
        [
          /CleaningActivity\/cards\?/,
          { data: [{ Id: 40, Code: 'A', Detalle: 'x,y,1' }] },
        ],
      ]);

      await expect(service.detail(10)).resolves.toMatchObject({
        checklist: { id: 40, activities: ['x,y,1'] },
        warnings: ['checklist_unavailable'],
      });
    });

    it('archivo roto y sin respaldo => null con aviso, no un checklist vacío', async () => {
      const { service } = build([
        [/CleaningActivity\/cards\/40$/, upstream(500)],
        [/CleaningActivity\/cards\?/, { data: [{ Id: 40, Code: 'A' }] }],
      ]);

      await expect(service.detail(10)).resolves.toMatchObject({
        checklist: null,
        warnings: ['checklist_unavailable'],
      });
    });

    it('sin checklist asignado no hay aviso', async () => {
      const { service } = build([
        [
          /CleaningTask\/cards\/10$/,
          { data: { ...TASK, CleaningChecklist: null } },
        ],
      ]);

      await expect(service.detail(10)).resolves.toMatchObject({
        checklist: null,
        warnings: [],
      });
    });

    it('checklist de supervisión y unidad ilegibles => point y unit null, un aviso de cada', async () => {
      const { service, paths } = build([
        [
          /CleaningSupervision\/cards/,
          { data: [SUPERVISION, { ...SUPERVISION, _id: 190 }] },
        ],
        [/CleaningActivity\/cards\/41$/, upstream(500)],
        [/CleaningActivity\/cards\?/, upstream(500)],
        [/Unit\/cards\/5$/, upstream(500)],
      ]);

      const detail = await service.detail(10);

      expect(detail.warnings).toEqual([
        'unit_unavailable',
        'checklist_unavailable',
      ]);
      expect(detail.supervisions.map((s) => s.id)).toEqual([200, 190]);
      expect(
        detail.supervisions.flatMap((s) => s.findings.map((f) => f.point)),
      ).toEqual([null, null, null, null]);
      expect(
        paths().filter((p) => p.endsWith('/CleaningActivity/cards/41')),
      ).toHaveLength(1);
    });

    it('sin supervisiones => lista vacía y supervision null', async () => {
      const { service } = build([[/CleaningSupervision\/cards/, { data: [] }]]);

      await expect(service.detail(10)).resolves.toMatchObject({
        supervision: null,
        supervisions: [],
      });
    });

    it('nunca hay más de 5 lecturas a la vez entre novedades y fotos', async () => {
      let active = 0;
      let max = 0;
      const slow = (answer: unknown) => async () => {
        max = Math.max(max, ++active);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        return answer;
      };
      const many = Array.from({ length: 12 }, (_, i) => ({
        _id: 700 + i,
        Index: i + 1,
      }));
      const { service } = build([
        [
          /CleaningSupervision\/cards/,
          slow({
            data: [200, 190, 180].map((_id) => ({ ...SUPERVISION, _id })),
          }),
        ],
        [/CleaningFinding\/cards\?/, slow({ data: many as Row[] })],
        [/CleaningFinding\/cards\/\d+\/attachments/, slow({ data: [PHOTO] })],
      ]);

      const detail = await service.detail(10);

      expect(detail.supervisions.flatMap((s) => s.findings)).toHaveLength(36);
      expect(max).toBe(5);
    });
  });

  describe('attachment', () => {
    it('descarga el adjunto listado, con el nombre del listado', async () => {
      const { service, getBuffer } = build();

      await expect(service.attachment(10, 'adj 1')).resolves.toEqual({
        data: Buffer.from('img'),
        contentType: 'image/jpeg',
        fileName: 'supervision_x.jpg',
      });
      expect(getBuffer).toHaveBeenCalledWith(
        '/classes/CleaningTask/cards/10/attachments/adj%201/download',
        'session',
        { timeout: 20_000, maxContentLength: 25 * 1024 * 1024 },
      );
    });

    it.each(['../../../Unit/cards/5', 'adj%201', 'ADJ 1', '', 'foto-1'])(
      'id «%s» que no está en el listado => 404 sin descargar',
      async (attachmentId) => {
        const { service, getBuffer } = build();

        await expect(
          service.attachment(10, attachmentId),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(getBuffer).not.toHaveBeenCalled();
      },
    );

    it('limpieza inexistente => 404 sin listar adjuntos', async () => {
      const { service, get, getBuffer } = build();

      await expect(service.attachment(99, 'adj 1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(get).toHaveBeenCalledTimes(1);
      expect(getBuffer).not.toHaveBeenCalled();
    });

    it('fallo del listado o de la descarga => 502', async () => {
      await expectBadGateway(
        build([[/cards\/10\/attachments$/, upstream(500)]]).service.attachment(
          10,
          'adj 1',
        ),
      );

      const { service, getBuffer } = build();
      getBuffer.mockRejectedValue(upstream(404));
      await expectBadGateway(service.attachment(10, 'adj 1'));
    });
  });

  describe('findingPhoto', () => {
    it('descarga la foto tras comprobar toda la cadena', async () => {
      const { service, getBuffer } = build();

      await expect(
        service.findingPhoto(10, 200, 300, 'foto-2'),
      ).resolves.toMatchObject({ fileName: 'arr_1.jpg' });
      expect(getBuffer).toHaveBeenCalledWith(
        '/classes/CleaningFinding/cards/300/attachments/foto-2/download',
        'session',
        { timeout: 20_000, maxContentLength: 25 * 1024 * 1024 },
      );
    });

    it.each<[string, [number, number, number, string]]>([
      ['limpieza inexistente', [99, 200, 300, 'foto-1']],
      ['supervisión de otra limpieza', [10, 201, 300, 'foto-1']],
      ['novedad de otra supervisión', [10, 200, 999, 'foto-1']],
      ['foto de otra novedad', [10, 200, 301, 'foto-1']],
      ['id con ../', [10, 200, 300, '../300/attachments/foto-1']],
    ])('%s => 404 sin descargar', async (_, args) => {
      const { service, getBuffer } = build();

      await expect(service.findingPhoto(...args)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(getBuffer).not.toHaveBeenCalled();
    });

    it('fallo al listar o descargar => 502', async () => {
      await expectBadGateway(
        build([
          [/CleaningSupervision\/cards/, upstream(500)],
        ]).service.findingPhoto(10, 200, 300, 'foto-1'),
      );

      const { service, getBuffer } = build();
      getBuffer.mockRejectedValue(upstream(500));
      await expectBadGateway(service.findingPhoto(10, 200, 300, 'foto-1'));
    });
  });

  const operations: Array<
    [string, (service: CleaningReadService) => Promise<unknown>]
  > = [
    ['list', (s) => s.list(page)],
    ['item', (s) => s.item(10)],
    ['detail', (s) => s.detail(10)],
    ['attachment', (s) => s.attachment(10, 'adj 1')],
    ['findingPhoto', (s) => s.findingPhoto(10, 200, 300, 'foto-1')],
  ];

  describe.each(operations)('%s: sesión, plazo y escritura', (_, run) => {
    it('en enfriamiento => 503 sin pedir sesión ni llamar', async () => {
      const { service, session, get, getBuffer } = build();
      session.isCoolingDown.mockReturnValue(true);

      await expect(run(service)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(session.getSessionId).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(getBuffer).not.toHaveBeenCalled();
    });

    it('sin sesión y sin enfriamiento => 503 sin llamar', async () => {
      const { service, session, get, getBuffer } = build();
      session.getSessionId.mockResolvedValue('');

      await expect(run(service)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(get).not.toHaveBeenCalled();
      expect(getBuffer).not.toHaveBeenCalled();
    });

    it('si al fallar la sesión quedó en enfriamiento => 503', async () => {
      const { service, session } = build([[/./, upstream(401)]]);
      session.refreshSession.mockImplementation(() => {
        session.isCoolingDown.mockReturnValue(true);
        return Promise.resolve();
      });

      await expect(run(service)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('la fuente no responde en 20 s => 504 y no se llama más', async () => {
      jest.useFakeTimers();
      let release: (value: unknown) => void = () => {};
      const { service, get } = build([
        [/./, () => new Promise((resolve) => (release = resolve))],
      ]);

      const result = run(service).catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(19_999);
      const calls = get.mock.calls.length;
      await jest.advanceTimersByTimeAsync(1);

      expect(await result).toBeInstanceOf(GatewayTimeoutException);
      release({ data: TASK });
      await jest.advanceTimersByTimeAsync(10);
      expect(get).toHaveBeenCalledTimes(calls);
      // El cupo de una lectura colgada se libera a los 60 s.
      await jest.advanceTimersByTimeAsync(40_000);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('el plazo también cubre el inicio de sesión', async () => {
      jest.useFakeTimers();
      const { service, session, get } = build();
      session.getSessionId.mockReturnValue(new Promise(() => {}));

      const result = run(service).catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(20_000);

      expect(await result).toBeInstanceOf(GatewayTimeoutException);
      expect(get).not.toHaveBeenCalled();
    });

    it('solo lee y no deja temporizadores', async () => {
      jest.useFakeTimers();
      const { service, client } = build();

      await run(service);

      expect(jest.getTimerCount()).toBe(0);
      for (const write of ['post', 'put', 'delete', 'postFormData'] as const) {
        expect(client[write]).not.toHaveBeenCalled();
      }
    });
  });
});
