import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { GuestLocationService } from './guest-location.service';

const unitCard = {
  _id: 4242,
  Code: 'I47',
  Description: 'Departamento I47',
  Floor: 3055144,
  _Building_description: 'I - Inglaterra',
};

const buildingCard = {
  _id: 3025058,
  Code: 'I',
  Name: 'Inglaterra',
  Description: 'I - Inglaterra',
  Address: 'Av. Inglaterra N31-120 y Mariana de Jesús',
  City: 'Quito',
};

const harness = (get: jest.Mock) => {
  const session = { get: jest.fn().mockResolvedValue('sesion-servicio') };

  return {
    get,
    session,
    service: new GuestLocationService(
      { get } as unknown as OpenmaintClient,
      session as unknown as OpenmaintServiceSession,
    ),
  };
};

const cards = () =>
  jest.fn().mockImplementation((path: string) =>
    Promise.resolve({
      data: path.includes('/Unit/') ? unitCard : buildingCard,
    }),
  );

describe('GuestLocationService', () => {
  it('arma unidad, planta, edificio y dirección a partir de las tarjetas', async () => {
    const { service } = harness(cards());

    await expect(service.lookup(4242, 3025058)).resolves.toEqual({
      unitName: 'I47',
      buildingName: 'Inglaterra',
      buildingAddress: 'Av. Inglaterra N31-120 y Mariana de Jesús, Quito',
      floorId: 3055144,
    });
  });

  it('deja la planta en nulo si la unidad no tiene una asignada', async () => {
    const get = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({
        data: path.includes('/Unit/')
          ? { ...unitCard, Floor: null }
          : buildingCard,
      }),
    );
    const { service } = harness(get);

    await expect(service.lookup(4242, 3025058)).resolves.toMatchObject({
      floorId: null,
    });
  });

  it('usa el edificio de la unidad si la tarjeta del edificio no tiene nombre', async () => {
    const get = jest.fn().mockImplementation((path: string) =>
      Promise.resolve({
        data: path.includes('/Unit/') ? unitCard : { Address: null },
      }),
    );
    const { service } = harness(get);

    await expect(service.lookup(4242, 3025058)).resolves.toEqual({
      unitName: 'I47',
      buildingName: 'I - Inglaterra',
      buildingAddress: null,
      floorId: 3055144,
    });
  });

  it('cachea el resultado y no vuelve a consultar openMAINT', async () => {
    const { service, get, session } = harness(cards());

    await service.lookup(4242, 3025058);
    await service.lookup(4242, 3025058);

    expect(session.get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('comparte una sola consulta entre visitas simultáneas', async () => {
    const { service, session } = harness(cards());

    await Promise.all([
      service.lookup(4242, 3025058),
      service.lookup(4242, 3025058),
    ]);

    expect(session.get).toHaveBeenCalledTimes(1);
  });

  it('con openMAINT caído devuelve vacío en vez de lanzar, y no reintenta enseguida', async () => {
    const get = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const { service } = harness(get);

    const vacio = {
      unitName: null,
      buildingName: null,
      buildingAddress: null,
      floorId: null,
    };

    await expect(service.lookup(4242, 3025058)).resolves.toEqual(vacio);
    await expect(service.lookup(4242, 3025058)).resolves.toEqual(vacio);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('no consulta nada si la estancia no tiene unidad ni edificio', async () => {
    const { service, get, session } = harness(cards());

    await expect(service.lookup(null, null)).resolves.toEqual({
      unitName: null,
      buildingName: null,
      buildingAddress: null,
      floorId: null,
    });
    expect(session.get).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
});
