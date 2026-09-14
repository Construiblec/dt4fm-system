import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { AuthorizationsService } from './authorizations.service';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';

const HOUR = 60 * 60 * 1000;
const PRADERA = 3019998;

const stayWith = (overrides: Partial<GuestStay> = {}): GuestStay =>
  ({
    id: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
    hostawayReservationId: '90000002',
    listingId: '288173',
    openmaintUnitId: 4242,
    buildingId: PRADERA,
    guestName: 'Bruno Salas',
    guestEmail: 'bruno@example.com',
    arrivalDate: '2026-09-13',
    departureDate: '2026-09-17',
    accessValidFrom: new Date(Date.now() - 24 * HOUR),
    accessValidTo: new Date(Date.now() + 48 * HOUR),
    status: 'active',
    tokenVersion: 1,
    ...overrides,
  }) as GuestStay;

const credentialWith = (
  overrides: Partial<AccessCredential> = {},
): AccessCredential =>
  ({
    id: 'cred-1',
    subjectType: 'guest',
    subjectRef: '90000002',
    scope: 'pedestrian',
    buildingId: PRADERA,
    status: 'active',
    syncState: 'synced',
    ...overrides,
  }) as AccessCredential;

type Harness = {
  service: AuthorizationsService;
  stayFind: jest.Mock;
  stayFindOne: jest.Mock;
  credentialFind: jest.Mock;
  findLiveBySubject: jest.Mock;
  regeneratePin: jest.Mock;
  changeScope: jest.Mock;
  getUnitsByBuilding: jest.Mock;
};

const harness = (options: {
  stays?: GuestStay[];
  credentials?: AccessCredential[];
  units?: unknown;
  buildings?: unknown[];
}): Harness => {
  const stayFind = jest.fn().mockResolvedValue(options.stays ?? []);
  const stayFindOne = jest.fn().mockResolvedValue(options.stays?.[0] ?? null);
  const credentialFind = jest.fn().mockResolvedValue(options.credentials ?? []);
  const findLiveBySubject = jest
    .fn()
    .mockResolvedValue(options.credentials?.[0] ?? null);
  const regeneratePin = jest.fn().mockResolvedValue(undefined);
  const changeScope = jest.fn().mockResolvedValue(undefined);
  const getUnitsByBuilding = jest.fn().mockResolvedValue(
    options.units ?? {
      data: [{ _id: 4242, Description: 'UI R302', Code: 'R302' }],
    },
  );

  const service = new AuthorizationsService(
    {
      find: stayFind,
      findOne: stayFindOne,
    } as unknown as Repository<GuestStay>,
    { find: credentialFind } as unknown as Repository<AccessCredential>,
    {
      findLiveBySubject,
      regeneratePin,
      changeScope,
    } as unknown as CredentialService,
    {
      list: jest
        .fn()
        .mockResolvedValue(
          options.buildings ?? [{ buildingId: PRADERA, name: 'Pradera' }],
        ),
    } as unknown as BuildingCatalogService,
    { getUnitsByBuilding } as unknown as OpenmaintService,
  );

  return {
    service,
    stayFind,
    stayFindOne,
    credentialFind,
    findLiveBySubject,
    regeneratePin,
    changeScope,
    getUnitsByBuilding,
  };
};

describe('AuthorizationsService', () => {
  describe('listado', () => {
    it('compone la etiqueta como "edificio · unidad"', async () => {
      const { service } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(
        '2026-09-11',
        '2026-09-18',
        'sesion',
      );

      expect(autorizacion.unitLabel).toBe('Pradera · UI R302');
      expect(autorizacion.accessLevel).toBe('pedestrian');
    });

    it('nunca devuelve el PIN', async () => {
      const { service } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      // La pantalla del supervisor no muestra el código; solo el portal del
      // huésped lo hace. Que no exista la clave es la garantía.
      expect(autorizacion).not.toHaveProperty('pin');
      expect(Object.keys(autorizacion).sort()).toEqual([
        'accessLevel',
        'checkIn',
        'checkOut',
        'guestName',
        'id',
        'unitLabel',
      ]);
    });

    it('deja fuera las estancias sin credencial viva', async () => {
      // Una estancia de un edificio sin lector: existe, pero no hay nada que
      // gestionar desde esta pantalla.
      const { service } = harness({
        stays: [
          stayWith(),
          stayWith({ id: 'otra', hostawayReservationId: '9999' }),
        ],
        credentials: [credentialWith()],
      });

      const autorizaciones = await service.list(undefined, undefined, 'sesion');

      expect(autorizaciones).toHaveLength(1);
      expect(autorizaciones[0].id).toBe('c47ca6f1-f675-4653-a3a6-31487feb054b');
    });

    it('solo pide estancias pendientes o activas', async () => {
      const { service, stayFind } = harness({ stays: [] });

      await service.list('2026-09-11', '2026-09-18', 'sesion');

      const [opciones] = stayFind.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];

      expect(opciones.where).toHaveProperty('arrivalDate');
      expect(opciones.where).toHaveProperty('status');
    });

    it('no consulta openMAINT si no hay estancias', async () => {
      const { service, getUnitsByBuilding, credentialFind } = harness({
        stays: [],
      });

      await expect(
        service.list(undefined, undefined, 'sesion'),
      ).resolves.toEqual([]);
      expect(credentialFind).not.toHaveBeenCalled();
      expect(getUnitsByBuilding).not.toHaveBeenCalled();
    });

    it('cae al nombre del edificio cuando el listing no está mapeado', async () => {
      const { service } = harness({
        stays: [stayWith({ openmaintUnitId: null })],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      expect(autorizacion.unitLabel).toBe('Pradera');
    });

    it('sigue respondiendo aunque openMAINT falle', async () => {
      const { service, getUnitsByBuilding } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });
      getUnitsByBuilding.mockRejectedValue(new Error('openMAINT caído'));

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      // Degradar a solo el edificio es mejor que romper la pantalla entera.
      expect(autorizacion.unitLabel).toBe('Pradera');
    });

    it('pide las unidades una vez por edificio, no una por fila', async () => {
      const { service, getUnitsByBuilding } = harness({
        stays: [
          stayWith(),
          stayWith({ id: 'b', hostawayReservationId: '90000003' }),
        ],
        credentials: [
          credentialWith(),
          credentialWith({ id: 'cred-2', subjectRef: '90000003' }),
        ],
      });

      await service.list(undefined, undefined, 'sesion');

      expect(getUnitsByBuilding).toHaveBeenCalledTimes(1);
    });
  });

  describe('acciones', () => {
    it('renueva el PIN de la credencial de esa estancia', async () => {
      const { service, regeneratePin } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      await service.regenerate(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
        'sesion',
      );

      expect(regeneratePin).toHaveBeenCalledWith('cred-1');
    });

    it('cambia el nivel de acceso sobre la credencial', async () => {
      const { service, changeScope } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      await service.changeAccessLevel(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
        'both',
        'sesion',
      );

      expect(changeScope).toHaveBeenCalledWith('cred-1', 'both');
    });

    it('no deja renovar el PIN de una estancia sin credencial', async () => {
      const { service, findLiveBySubject } = harness({ stays: [stayWith()] });
      findLiveBySubject.mockResolvedValue(null);

      await expect(service.regenerate('c47ca6f1', 'sesion')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('devuelve 404 si la estancia no existe', async () => {
      const { service, stayFindOne } = harness({});
      stayFindOne.mockResolvedValue(null);

      await expect(service.detail('c47ca6f1', 'sesion')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
