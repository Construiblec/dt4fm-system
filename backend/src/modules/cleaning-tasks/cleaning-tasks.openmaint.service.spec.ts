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

  it('sin endedFrom no añade filtro', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.getAllTasks({ limit: 200, sort: 'newest' });

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).not.toContain('filter=');
  });
});
