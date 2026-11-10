import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import {
  AuthorizationsService,
  CAV_SUSPENDED_REASON,
} from './authorizations.service';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';
import { GuestPinNoticeService } from './guest-pin-notice.service';

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
  revoke: jest.Mock;
  reactivate: jest.Mock;
  findLiveForGuest: jest.Mock;
  staySave: jest.Mock;
  credentialFindOne: jest.Mock;
  getUnitsByBuilding: jest.Mock;
  notify: jest.Mock;
  statusFor: jest.Mock;
  requestRenewalMessage: jest.Mock;
};

const harness = (options: {
  stays?: GuestStay[];
  credentials?: AccessCredential[];
  units?: unknown;
  buildings?: unknown[];
  revoked?: AccessCredential;
}): Harness => {
  const stayFind = jest.fn().mockResolvedValue(options.stays ?? []);
  const stayFindOne = jest.fn().mockResolvedValue(options.stays?.[0] ?? null);
  const credentialFind = jest.fn().mockResolvedValue(options.credentials ?? []);
  const findLiveBySubject = jest
    .fn()
    .mockResolvedValue(options.credentials?.[0] ?? null);
  const regeneratePin = jest.fn().mockResolvedValue(undefined);
  const changeScope = jest.fn().mockResolvedValue(undefined);
  const revoke = jest.fn().mockResolvedValue(undefined);
  const reactivate = jest.fn().mockResolvedValue(undefined);
  const findLiveForGuest = jest
    .fn()
    .mockResolvedValue(options.credentials ?? []);
  const staySave = jest.fn((stay: GuestStay) => Promise.resolve(stay));
  const credentialFindOne = jest
    .fn()
    .mockResolvedValue(options.revoked ?? null);
  const getUnitsByBuilding = jest.fn().mockResolvedValue(
    options.units ?? {
      data: [{ _id: 4242, Description: 'UI R302', Code: 'R302' }],
    },
  );

  const notify = jest.fn().mockResolvedValue({ outcome: 'sent' });
  const requestRenewalMessage = jest.fn().mockResolvedValue(undefined);
  const statusFor = jest.fn(
    (items: { stay: GuestStay }[]) =>
      new Map(
        items.map(({ stay }) => [
          stay.id,
          { status: 'sent', at: '2026-09-12T10:00:00.000Z', error: null },
        ]),
      ),
  );

  const service = new AuthorizationsService(
    {
      find: stayFind,
      findOne: stayFindOne,
      save: staySave,
    } as unknown as Repository<GuestStay>,
    {
      find: credentialFind,
      findOne: credentialFindOne,
    } as unknown as Repository<AccessCredential>,
    {
      findLiveBySubject,
      findLiveForGuest,
      regeneratePin,
      changeScope,
      revoke,
      reactivate,
    } as unknown as CredentialService,
    {
      list: jest
        .fn()
        .mockResolvedValue(
          options.buildings ?? [{ buildingId: PRADERA, name: 'Pradera' }],
        ),
    } as unknown as BuildingCatalogService,
    { getUnitsByBuilding } as unknown as OpenmaintService,
    {
      notify,
      statusFor,
      requestRenewalMessage,
    } as unknown as GuestPinNoticeService,
    { get: () => undefined } as unknown as ConfigService,
  );

  return {
    service,
    stayFind,
    stayFindOne,
    credentialFind,
    findLiveBySubject,
    regeneratePin,
    changeScope,
    revoke,
    reactivate,
    findLiveForGuest,
    staySave,
    credentialFindOne,
    getUnitsByBuilding,
    notify,
    statusFor,
    requestRenewalMessage,
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

    it('separa las horas de la reserva de la vigencia del PIN', async () => {
      const desde = new Date('2026-10-25T13:00:00-05:00');
      const hasta = new Date('2026-10-28T16:00:00-05:00');
      const { service } = harness({
        stays: [
          stayWith({
            accessValidFrom: desde,
            accessValidTo: hasta,
            checkInAt: new Date('2026-10-25T15:00:00-05:00'),
            checkOutAt: new Date('2026-10-28T11:00:00-05:00'),
          }),
        ],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      expect(autorizacion).toMatchObject({
        checkIn: '2026-10-25T20:00:00.000Z',
        checkOut: '2026-10-28T16:00:00.000Z',
        pinValidFrom: desde.toISOString(),
        pinValidTo: hasta.toISOString(),
      });
    });

    it('sin horas guardadas las deduce quitando los márgenes', async () => {
      const { service } = harness({
        stays: [
          stayWith({
            accessValidFrom: new Date('2026-10-25T12:00:00-05:00'),
            accessValidTo: new Date('2026-10-28T14:00:00-05:00'),
          }),
        ],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      // Márgenes por defecto: 3 h antes y 3 h después.
      expect(autorizacion.checkIn).toBe('2026-10-25T20:00:00.000Z');
      expect(autorizacion.checkOut).toBe('2026-10-28T16:00:00.000Z');
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
        'accessRevoked',
        'checkIn',
        'checkOut',
        'guestName',
        'id',
        'pinNotice',
        'pinValidFrom',
        'pinValidTo',
        'unitLabel',
      ]);
    });

    it('incluye el estado del aviso del PIN, sin el PIN', async () => {
      const { service, statusFor } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      const [autorizacion] = await service.list(undefined, undefined, 'sesion');

      expect(statusFor).toHaveBeenCalledTimes(1);
      expect(autorizacion.pinNotice).toEqual({
        status: 'sent',
        at: '2026-09-12T10:00:00.000Z',
        error: null,
      });
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

    it('mantiene las revocadas por el CAV, sin nivel ni aviso', async () => {
      const revocadaEl = new Date('2026-09-12T15:00:00.000Z');
      const { service, statusFor } = harness({
        stays: [
          stayWith(),
          stayWith({
            id: 'revocada',
            hostawayReservationId: '90000003',
            accessSuspendedAt: revocadaEl,
            accessSuspendedBy: 'cav.ana',
          }),
        ],
        credentials: [credentialWith()],
      });

      const [viva, revocada] = await service.list(
        undefined,
        undefined,
        'sesion',
      );

      expect(viva.accessRevoked).toBeNull();
      expect(revocada).toMatchObject({
        id: 'revocada',
        accessLevel: null,
        accessRevoked: { at: revocadaEl.toISOString(), by: 'cav.ana' },
        pinNotice: { status: 'not_applicable' },
      });
      // El aviso solo se calcula para las que tienen credencial viva.
      const [pares] = statusFor.mock.calls[0] as [{ stay: GuestStay }[]];
      expect(pares.map(({ stay }) => stay.id)).toEqual([viva.id]);
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

    it('pide el mensaje de renovación y publica el PIN nuevo después de renovarlo', async () => {
      const { service, regeneratePin, notify, requestRenewalMessage } = harness(
        {
          stays: [stayWith()],
          credentials: [credentialWith()],
        },
      );

      await service.regenerate(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
        'sesion',
      );

      expect(notify).toHaveBeenCalledWith(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
      );
      expect(requestRenewalMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c47ca6f1-f675-4653-a3a6-31487feb054b' }),
        expect.objectContaining({ id: 'cred-1' }),
      );
      expect(regeneratePin.mock.invocationCallOrder[0]).toBeLessThan(
        requestRenewalMessage.mock.invocationCallOrder[0],
      );
      expect(requestRenewalMessage.mock.invocationCallOrder[0]).toBeLessThan(
        notify.mock.invocationCallOrder[0],
      );
    });

    it('el reenvío fuerza la reescritura del PIN en la reserva', async () => {
      const { service, notify } = harness({
        stays: [stayWith()],
        credentials: [credentialWith()],
      });

      const resultado = await service.resendPinNotice(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
      );

      expect(notify).toHaveBeenCalledWith(
        'c47ca6f1-f675-4653-a3a6-31487feb054b',
        { force: true },
      );
      expect(resultado).toEqual({ outcome: 'sent' });
    });

    it('no reenvía el PIN de una estancia sin credencial', async () => {
      const { service, findLiveBySubject, notify } = harness({
        stays: [stayWith()],
      });
      findLiveBySubject.mockResolvedValue(null);

      await expect(service.resendPinNotice('c47ca6f1')).rejects.toThrow(
        NotFoundException,
      );
      expect(notify).not.toHaveBeenCalled();
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

    describe('revocar y restaurar', () => {
      const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';

      it('`none` marca la estancia y revoca todas sus credenciales', async () => {
        const { service, revoke, staySave } = harness({
          stays: [stayWith()],
          credentials: [
            credentialWith(),
            credentialWith({ id: 'cred-2', scope: 'vehicular' }),
          ],
        });

        const vista = await service.changeAccessLevel(
          STAY,
          'none',
          'sesion',
          'cav.ana',
        );

        expect(staySave).toHaveBeenCalledWith(
          expect.objectContaining({ accessSuspendedBy: 'cav.ana' }),
        );
        // La marca va antes del DELETE para que un webhook no reemita.
        expect(staySave.mock.invocationCallOrder[0]).toBeLessThan(
          revoke.mock.invocationCallOrder[0],
        );
        expect(revoke).toHaveBeenCalledWith('cred-1', CAV_SUSPENDED_REASON);
        expect(revoke).toHaveBeenCalledWith('cred-2', CAV_SUSPENDED_REASON);
        expect(vista.accessLevel).toBeNull();
        expect(vista.accessRevoked?.by).toBe('cav.ana');
      });

      it('un nivel sobre una estancia revocada reactiva la misma credencial', async () => {
        const stay = stayWith({
          accessSuspendedAt: new Date(),
          accessSuspendedBy: 'cav.ana',
        });
        const {
          service,
          reactivate,
          staySave,
          changeScope,
          findLiveBySubject,
        } = harness({
          stays: [stay],
          revoked: credentialWith({ id: 'cred-1', status: 'revoked' }),
        });
        findLiveBySubject.mockResolvedValue(credentialWith({ scope: 'both' }));

        await service.changeAccessLevel(STAY, 'both', 'sesion', 'cav.ana');

        expect(reactivate).toHaveBeenCalledWith(
          'cred-1',
          'both',
          stay.accessValidFrom,
          stay.accessValidTo,
        );
        expect(changeScope).not.toHaveBeenCalled();
        expect(staySave).toHaveBeenCalledWith(
          expect.objectContaining({
            accessSuspendedAt: null,
            accessSuspendedBy: null,
          }),
        );
      });

      it('si la reactivación falla, la estancia sigue revocada', async () => {
        const { service, reactivate, staySave } = harness({
          stays: [stayWith({ accessSuspendedAt: new Date() })],
          revoked: credentialWith({ status: 'revoked' }),
        });
        reactivate.mockRejectedValue(new BadRequestException('PIN tomado'));

        await expect(
          service.changeAccessLevel(STAY, 'pedestrian', 'sesion'),
        ).rejects.toThrow(BadRequestException);
        expect(staySave).not.toHaveBeenCalled();
      });

      it('sin credencial revocada no hay nada que restaurar', async () => {
        const { service } = harness({
          stays: [stayWith({ accessSuspendedAt: new Date() })],
        });

        await expect(
          service.changeAccessLevel(STAY, 'pedestrian', 'sesion'),
        ).rejects.toThrow(NotFoundException);
      });

      it('no renueva ni reenvía el PIN de un acceso revocado', async () => {
        const { service, regeneratePin, notify } = harness({
          stays: [stayWith({ accessSuspendedAt: new Date() })],
        });

        await expect(service.regenerate(STAY, 'sesion')).rejects.toThrow(
          BadRequestException,
        );
        await expect(service.resendPinNotice(STAY)).rejects.toThrow(
          BadRequestException,
        );
        expect(regeneratePin).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
      });

      it('el detalle de un acceso revocado no pide el aviso del PIN', async () => {
        const { service, statusFor } = harness({
          stays: [stayWith({ accessSuspendedAt: new Date() })],
        });

        const vista = await service.detail(STAY, 'sesion');

        expect(vista.accessLevel).toBeNull();
        expect(vista.pinNotice.status).toBe('not_applicable');
        expect(statusFor).not.toHaveBeenCalled();
      });
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
