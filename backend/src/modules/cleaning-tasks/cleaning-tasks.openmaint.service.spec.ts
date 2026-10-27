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
  NombrePlantilla: name,
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
        return { data: [{ NombrePlantilla: 'plantilla 2', Detalle: 'a,b,1' }] };
      }
      return {
        data: [
          { Id: 2256763, NombrePlantilla: 'Plantilla aseo' },
          { Id: BROKEN_ID, NombrePlantilla: 'plantilla 2', Detalle: 'a,b,1' },
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
    expect(data[0]).toMatchObject({ NombrePlantilla: 'Plantilla aseo' });
    expect(data[0]._plantillaRota).toBeUndefined();
    expect(data[1]).toMatchObject({
      _id: BROKEN_ID,
      NombrePlantilla: 'plantilla 2',
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
      NombrePlantilla: 'plantilla 2',
      Plantilla: null,
      _plantillaRota: true,
    });
    expect(get).toHaveBeenCalledWith(
      expect.stringContaining(
        'attrs=Id,Code,Description,NombrePlantilla,Detalle',
      ),
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
  it('con equipo, filtra InternalEmployee por Team', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.listInternalEmployees(2397132);

    const [[path]] = get.mock.calls as [[string, string]];
    expect(path).toContain('/classes/InternalEmployee/cards?limit=500&filter=');
    expect(JSON.parse(decodeURIComponent(path.split('filter=')[1]))).toEqual({
      attribute: {
        simple: { attribute: 'Team', operator: 'equal', value: ['2397132'] },
      },
    });
  });

  it('sin equipo, los pide todos', async () => {
    const get = jest.fn().mockResolvedValue({ data: [] });
    const service = buildService(get);

    await service.listInternalEmployees();

    expect(get).toHaveBeenCalledWith(
      '/classes/InternalEmployee/cards?limit=500',
      'session',
    );
  });
});
