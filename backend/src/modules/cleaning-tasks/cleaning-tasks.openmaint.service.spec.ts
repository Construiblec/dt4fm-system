import { InternalServerErrorException } from '@nestjs/common';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';

/**
 * Checklist con el archivo de `Plantilla` perdido en el DMS: openMAINT responde
 * 500 al serializar esa tarjeta, y con ella toda la lista.
 */
const BROKEN_ID = 7144478;
const cmisError = () =>
  Object.assign(new Error('Request failed with status code 500'), {
    response: { status: 500 },
  });

const fullCard = (id: number, name: string) => ({
  _id: id,
  Description: name,
  Detalle: 'Baño,Limpiar,5',
  Plantilla: null,
});

const buildService = (get: jest.Mock) => {
  const client = { get } as never;
  const sessionService = {
    getSessionId: jest.fn().mockResolvedValue('session'),
    refreshSession: jest.fn(),
  } as never;
  return new CleaningTasksOpenmaintService(client, sessionService);
};

/** Simula openMAINT: la lista completa y la tarjeta rota fallan; con `attrs` responde. */
const fakeOpenmaint = () =>
  jest.fn(async (path: string) => {
    if (path.includes('attrs=')) {
      if (path.includes('filter=')) {
        return { data: [{ Description: 'plantilla 2', Detalle: 'a,b,1' }] };
      }
      return {
        data: [
          { Id: 2256763, Description: 'Plantilla aseo' },
          { Id: BROKEN_ID, Description: 'plantilla 2', Detalle: 'a,b,1' },
        ],
      };
    }
    if (path === '/classes/CleaningActivity/cards?limit=200') throw cmisError();
    if (path.endsWith(`/cards/${BROKEN_ID}`)) throw cmisError();
    if (path.endsWith('/cards/2256763')) {
      return { data: fullCard(2256763, 'Plantilla aseo') };
    }
    throw new Error(`ruta no simulada: ${path}`);
  });

describe('CleaningTasksOpenmaintService — checklist con el archivo perdido', () => {
  it('lista igual: la tarjeta rota sale sin archivo y las demás completas', async () => {
    const service = buildService(fakeOpenmaint());

    const { data } = await service.listCleaningActivities();

    expect(data.map((c) => c._id)).toEqual([2256763, BROKEN_ID]);
    expect(data[0]).toMatchObject({ Description: 'Plantilla aseo' });
    expect(data[0]._plantillaRota).toBeUndefined();
    expect(data[1]).toMatchObject({
      _id: BROKEN_ID,
      Description: 'plantilla 2',
      Detalle: 'a,b,1',
      Plantilla: null,
      _plantillaRota: true,
    });
  });

  it('lee la tarjeta rota sin el archivo, filtrando por Id', async () => {
    const get = fakeOpenmaint();
    const service = buildService(get);

    const { data } = await service.getCleaningActivity(BROKEN_ID);

    expect(data).toMatchObject({
      _id: BROKEN_ID,
      Description: 'plantilla 2',
      Plantilla: null,
      _plantillaRota: true,
    });
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining('attrs=Id,Code,Description,Detalle'),
      'session',
    );
  });

  it('si ni siquiera se puede leer sin el archivo, avisa con un 500', async () => {
    const service = buildService(jest.fn().mockRejectedValue(cmisError()));

    await expect(service.getCleaningActivity(BROKEN_ID)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(service.listCleaningActivities()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('CleaningTasksOpenmaintService — empleados asignables', () => {
  it('con equipo, filtra Employee por Team', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.listEmployees(2397132);

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).toContain('/classes/Employee/cards?limit=500&filter=');
    expect(JSON.parse(decodeURIComponent(path.split('filter=')[1]))).toEqual({
      attribute: {
        simple: { attribute: 'Team', operator: 'equal', value: ['2397132'] },
      },
    });
  });

  it('sin equipo, los pide todos', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.listEmployees();

    expect(get).toHaveBeenCalledWith(
      '/classes/Employee/cards?limit=500',
      'session',
    );
  });
});

describe('CleaningTasksOpenmaintService — limpiezas del operario', () => {
  it('con newest, pide las recién creadas primero', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getTasksByEmployee(4567, 'token', 200, 0, 'newest');

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).toContain('&limit=200&start=0&sort=');
    expect(JSON.parse(decodeURIComponent(path.split('sort=')[1]))).toEqual([
      { property: '_id', direction: 'DESC' },
    ]);
  });

  it('sin orden, no añade sort', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getTasksByEmployee(4567, 'token', 50, 0);

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).not.toContain('sort=');
  });
});

describe('CleaningTasksOpenmaintService — todas las limpiezas', () => {
  // -05:00 llega a openMAINT como el mismo instante en UTC. El inicio se corre
  // 1 ms porque `greater` es estricto: así el borde queda incluido.
  const endedFromFilter = {
    simple: {
      attribute: 'ActualEndTime',
      operator: 'greater',
      value: ['2026-11-09T12:59:59.999Z'],
    },
  };
  // El fin va tal cual: `less` estricto deja el borde fuera.
  const endedToFilter = {
    simple: {
      attribute: 'ActualEndTime',
      operator: 'less',
      value: ['2026-11-10T13:00:00.000Z'],
    },
  };
  const filterOf = (path: string): unknown =>
    JSON.parse(decodeURIComponent(path.split('filter=')[1])) as unknown;

  it('endedFrom filtra ActualEndTime con greater, con el borde incluido', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ endedFrom: '2026-11-09T08:00:00-05:00' });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({ attribute: endedFromFilter });
  });

  it('endedTo filtra ActualEndTime con less, con el borde excluido', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ endedTo: '2026-11-10T08:00:00-05:00' });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({ attribute: endedToFilter });
  });

  it('un día completo: de medianoche a medianoche en hora de Ecuador', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({
      endedFrom: '2026-11-16T00:00:00-05:00',
      endedTo: '2026-11-17T00:00:00-05:00',
    });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        and: [
          {
            simple: {
              attribute: 'ActualEndTime',
              operator: 'greater',
              value: ['2026-11-16T04:59:59.999Z'],
            },
          },
          {
            simple: {
              attribute: 'ActualEndTime',
              operator: 'less',
              value: ['2026-11-17T05:00:00.000Z'],
            },
          },
        ],
      },
    });
  });

  it('endedFrom se combina con la fase en un and', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({
      phase: 'Completed',
      endedFrom: '2026-11-09T08:00:00-05:00',
    });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        and: [
          {
            simple: {
              attribute: 'phase',
              operator: 'equal',
              value: 'Completed',
            },
          },
          endedFromFilter,
        ],
      },
    });
  });

  it('plannedFrom/plannedTo filtran PlannedStartTime en [desde, hasta)', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({
      plannedFrom: '2026-11-16T00:00:00-05:00',
      plannedTo: '2026-11-17T00:00:00-05:00',
    });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        and: [
          {
            simple: {
              attribute: 'PlannedStartTime',
              operator: 'greater',
              value: ['2026-11-16T04:59:59.999Z'],
            },
          },
          {
            simple: {
              attribute: 'PlannedStartTime',
              operator: 'less',
              value: ['2026-11-17T05:00:00.000Z'],
            },
          },
        ],
      },
    });
  });

  it('unitId filtra Unit por igualdad', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ unitId: 321 });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        simple: { attribute: 'Unit', operator: 'equal', value: [321] },
      },
    });
  });

  it('checkoutDate filtra CheckoutDate por igualdad', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ checkoutDate: '2026-11-26' });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        simple: {
          attribute: 'CheckoutDate',
          operator: 'equal',
          value: '2026-11-26',
        },
      },
    });
  });

  it.each([
    [true, 'isnotnull'],
    [false, 'isnull'],
  ])('assigned=%j filtra Employee con %s', async (assigned, operator) => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ assigned });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: { simple: { attribute: 'Employee', operator } },
    });
  });

  it('fase, fecha de salida y operario se combinan en un and', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({
      phase: 'Assigned',
      checkoutDate: '2026-11-26',
      assigned: false,
    });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(filterOf(path)).toEqual({
      attribute: {
        and: [
          {
            simple: {
              attribute: 'phase',
              operator: 'equal',
              value: 'Assigned',
            },
          },
          {
            simple: {
              attribute: 'CheckoutDate',
              operator: 'equal',
              value: '2026-11-26',
            },
          },
          { simple: { attribute: 'Employee', operator: 'isnull' } },
        ],
      },
    });
  });

  it('sin endedFrom no añade filtro', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ limit: 200, sort: 'newest' });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).not.toContain('filter=');
  });
});

describe('CleaningTasksOpenmaintService — adjuntos con la sesión interna', () => {
  const buildWithBuffer = (get: jest.Mock, getBuffer: jest.Mock) =>
    new CleaningTasksOpenmaintService(
      { get, getBuffer } as never,
      {
        getSessionId: jest.fn().mockResolvedValue('session'),
        refreshSession: jest.fn(),
      } as never,
    );

  it('lista con la sesión de servicio y no envuelve el error', async () => {
    const get = jest.fn().mockResolvedValueOnce({ data: [] });
    const service = buildWithBuffer(get, jest.fn());

    await service.getAttachmentsWithSession(7);
    expect(get).toHaveBeenCalledWith(
      '/classes/CleaningTask/cards/7/attachments',
      'session',
    );

    const error = cmisError();
    get.mockRejectedValueOnce(error);
    await expect(service.getAttachmentsWithSession(7)).rejects.toBe(error);
  });

  it('codifica el id al descargar y no envuelve el error', async () => {
    const getBuffer = jest.fn().mockResolvedValueOnce({});
    const service = buildWithBuffer(jest.fn(), getBuffer);

    await service.downloadAttachmentWithSession(7, '../../a b');
    expect(getBuffer).toHaveBeenCalledWith(
      '/classes/CleaningTask/cards/7/attachments/..%2F..%2Fa%20b/download',
      'session',
      undefined,
    );

    const error = cmisError();
    getBuffer.mockRejectedValueOnce(error);
    await expect(service.downloadAttachmentWithSession(7, 'a')).rejects.toBe(
      error,
    );
  });

  it('ante un 401 renueva la sesión y reintenta una vez', async () => {
    const unauthorized = Object.assign(new Error('401'), {
      response: { status: 401 },
    });
    const get = jest
      .fn()
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ data: [] });
    const service = buildWithBuffer(get, jest.fn());

    await expect(service.getAttachmentsWithSession(7)).resolves.toEqual({
      data: [],
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('CleaningTasksOpenmaintService — lecturas estrictas', () => {
  type Call = [string, string, { timeout: number }];
  const filterOf = (path: string): unknown =>
    JSON.parse(
      decodeURIComponent(path.split('filter=')[1].split('&')[0]),
    ) as unknown;

  const reads: Array<
    [string, (s: CleaningTasksOpenmaintService) => Promise<unknown>]
  > = [
    ['findTasksByReservation', (s) => s.findTasksByReservation('R1')],
    [
      'findHostawayTasksByCheckout',
      (s) => s.findHostawayTasksByCheckout('2026-11-26'),
    ],
    ['listUnitsWithListingOrThrow', (s) => s.listUnitsWithListingOrThrow()],
    ['listChecklistOptions', (s) => s.listChecklistOptions()],
  ];

  describe.each(reads)('%s', (_, read) => {
    it('va con plazo y devuelve vacío solo si la fuente lo dice', async () => {
      const get = jest.fn().mockResolvedValue({ data: [] });

      await expect(read(buildService(get))).resolves.toEqual([]);

      const [[, session, config]] = get.mock.calls as Call[];
      expect(session).toBe('session');
      expect(config).toEqual({ timeout: 20_000 });
    });

    it('un fallo se lanza', async () => {
      await expect(
        read(buildService(jest.fn().mockRejectedValue(cmisError()))),
      ).rejects.toThrow();
    });

    it.each([undefined, '<html></html>', {}, { data: null }])(
      'respuesta sin listado (%j) se lanza',
      async (answer) => {
        await expect(
          read(buildService(jest.fn().mockResolvedValue(answer))),
        ).rejects.toThrow('sin listado');
      },
    );
  });

  it('findTasksByReservation filtra por la reserva, las más nuevas primero', async () => {
    const get = jest.fn().mockResolvedValue({ data: [{ _id: 1 }] });

    await expect(
      buildService(get).findTasksByReservation('R1'),
    ).resolves.toEqual([{ _id: 1 }]);

    const [[path]] = get.mock.calls as Call[];
    expect(path).toContain('limit=500');
    expect(path).toContain('&sort=');
    expect(filterOf(path)).toEqual({
      attribute: {
        simple: {
          attribute: 'HostawayReservation',
          operator: 'equal',
          value: 'R1',
        },
      },
    });
  });

  it('findHostawayTasksByCheckout filtra por fecha y por tener reserva', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });

    await buildService(get).findHostawayTasksByCheckout('2026-11-26');

    const [[path]] = get.mock.calls as Call[];
    expect(filterOf(path)).toEqual({
      attribute: {
        and: [
          {
            simple: {
              attribute: 'CheckoutDate',
              operator: 'equal',
              value: '2026-11-26',
            },
          },
          {
            simple: { attribute: 'HostawayReservation', operator: 'isnotnull' },
          },
        ],
      },
    });
  });

  it.each([reads[0], reads[1]])(
    '%s: un listado que llega al tope se lanza',
    async (_, read) => {
      const data = Array.from({ length: 500 }, (_, i) => ({ _id: i }));
      await expect(
        read(buildService(jest.fn().mockResolvedValue({ data }))),
      ).rejects.toThrow('superó el tope');
    },
  );

  it('listChecklistOptions toma el id de `Id` o de `_id`', async () => {
    const get = jest.fn().mockResolvedValue({
      data: [
        { Id: 40, Code: 'A', Description: 'Aseo' },
        { _id: 41, Code: 'SUPERVISION' },
      ],
    });

    await expect(buildService(get).listChecklistOptions()).resolves.toEqual([
      { id: 40, code: 'A', description: 'Aseo' },
      { id: 41, code: 'SUPERVISION', description: null },
    ]);
    const [[path]] = get.mock.calls as Call[];
    expect(path).toContain('attrs=Id,Code,Description');
  });

  it('taskExistsByReservationId: true o false según haya tarjetas, con plazo', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ _id: 1 }] })
      .mockResolvedValueOnce({ data: [] });
    const service = buildService(get);

    await expect(service.taskExistsByReservationId('R1')).resolves.toBe(true);
    await expect(service.taskExistsByReservationId('R1')).resolves.toBe(false);
    const [[, , config]] = get.mock.calls as Call[];
    expect(config).toEqual({ timeout: 20_000 });
  });

  it('taskExistsByReservationId: un fallo se lanza, nunca es false', async () => {
    const error: unknown = await buildService(
      jest.fn().mockRejectedValue(cmisError()),
    )
      .taskExistsByReservationId('R1')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect((error as Error).message).not.toMatch(/openmaint/i);
  });
});
