import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';
import { GuestPortalDataService } from './guest-portal-data.service';

const HOUR = 60 * 60 * 1000;
const PIN = '4813';

const stayWith = (overrides: Partial<GuestStay> = {}): GuestStay =>
  ({
    id: 'c47ca6f1-f675-4653-a3a6-31487feb054b',
    hostawayReservationId: '90000002',
    listingId: '288173',
    openmaintUnitId: 4242,
    buildingId: 3019998,
    guestName: 'Bruno Salas',
    guestEmail: 'bruno@example.com',
    guestLastNameHash: null,
    arrivalDate: '2026-09-11',
    departureDate: '2026-09-15',
    accessValidFrom: new Date(Date.now() - 24 * HOUR),
    accessValidTo: new Date(Date.now() + 48 * HOUR),
    status: 'active',
    tokenVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as GuestStay;

type Harness = {
  service: GuestPortalDataService;
  revealPin: jest.Mock;
};

const harness = (
  live: Partial<AccessCredential>[],
  env: Record<string, string> = { ACCESS_GUEST_LEAD_HOURS: '0' },
): Harness => {
  const revealPin = jest.fn().mockReturnValue(PIN);
  const credentials = {
    findLiveForGuest: jest.fn().mockResolvedValue(live),
    revealPin,
  } as unknown as CredentialService;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;

  return {
    revealPin,
    service: new GuestPortalDataService(
      {} as unknown as Repository<GuestStay>,
      credentials,
      config,
    ),
  };
};

const credencial = {
  id: 'cred-1',
  syncState: 'synced' as const,
  scope: 'pedestrian' as const,
};

describe('GuestPortalDataService', () => {
  it('muestra el PIN dentro de la ventana de acceso', async () => {
    const { service, revealPin } = harness([credencial]);

    const data = await service.getPortalData(stayWith());

    expect(data).toMatchObject({ pinState: 'disponible', pin: PIN });
    expect(revealPin).toHaveBeenCalledTimes(1);
  });

  it('antes del check-in no muestra el PIN, y ni siquiera lo descifra', async () => {
    const { service, revealPin } = harness([credencial]);

    const data = await service.getPortalData(
      stayWith({ accessValidFrom: new Date(Date.now() + 24 * HOUR) }),
    );

    expect(data).toMatchObject({ pinState: 'antes-del-checkin', pin: null });
    // Que no se llame es la garantía de que el PIN no sale del cifrado si no
    // se va a mostrar.
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('marca como finalizada la estancia cuyo acceso ya venció', async () => {
    const { service, revealPin } = harness([credencial]);

    const data = await service.getPortalData(
      stayWith({ accessValidTo: new Date(Date.now() - HOUR) }),
    );

    expect(data).toMatchObject({ pinState: 'finalizado', pin: null });
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('un edificio sin control de accesos no es un error, es un estado', async () => {
    const { service, revealPin } = harness([]);

    const data = await service.getPortalData(
      stayWith({ buildingId: null, openmaintUnitId: null }),
    );

    expect(data).toMatchObject({
      pinState: 'sin-cobertura',
      pin: null,
      credentialId: null,
      syncState: null,
      hasVehicularAccess: false,
    });
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('expone el estado de sincronización para diagnóstico', async () => {
    const { service } = harness([{ ...credencial, syncState: 'failed' }]);

    const data = await service.getPortalData(stayWith());

    expect(data.syncState).toBe('failed');
    // `failed` no oculta el PIN: significa que no llegó a la puerta, y el
    // huésped necesita el código igual para cuando alguien lo resuelva.
    expect(data.pin).toBe(PIN);
  });

  describe('acceso vehicular', () => {
    it('no lo anuncia con una credencial solo peatonal', async () => {
      const { service } = harness([credencial]);

      await expect(service.getPortalData(stayWith())).resolves.toMatchObject({
        hasVehicularAccess: false,
      });
    });

    it('lo anuncia cuando el ámbito incluye la entrada vehicular', async () => {
      const { service } = harness([{ ...credencial, scope: 'both' }]);

      await expect(service.getPortalData(stayWith())).resolves.toMatchObject({
        hasVehicularAccess: true,
      });
    });

    it('con varias credenciales vivas muestra siempre la de mayor alcance', async () => {
      const { service } = harness([
        { ...credencial, id: 'peatonal' },
        { ...credencial, id: 'ambas', scope: 'both' },
      ]);

      await expect(service.getPortalData(stayWith())).resolves.toMatchObject({
        credentialId: 'ambas',
      });
    });
  });

  describe('check-in y reporte de incidencias', () => {
    it('reconstruye el check-in sumando el margen de acceso', async () => {
      const accessValidFrom = new Date('2026-09-14T17:00:00.000Z');
      const { service } = harness([credencial], {
        ACCESS_GUEST_LEAD_HOURS: '3',
      });

      const data = await service.getPortalData(stayWith({ accessValidFrom }));

      expect(data.checkInAt.toISOString()).toBe('2026-09-14T20:00:00.000Z');
    });

    it('permite reportar durante la estadía', async () => {
      const { service } = harness([credencial]);

      await expect(service.getPortalData(stayWith())).resolves.toMatchObject({
        canReportIncident: true,
      });
    });

    it('no permite reportar antes del check-in aunque el margen ya abra la puerta', async () => {
      // La puerta abre 3 h antes, pero el check-in es dentro de 1 h.
      const { service } = harness([credencial], {
        ACCESS_GUEST_LEAD_HOURS: '3',
      });

      const data = await service.getPortalData(
        stayWith({ accessValidFrom: new Date(Date.now() - 2 * HOUR) }),
      );

      expect(data).toMatchObject({
        pinState: 'disponible',
        canReportIncident: false,
      });
    });

    it('no permite reportar si la reserva no está vinculada a un edificio', async () => {
      const { service } = harness([], {});

      await expect(
        service.getPortalData(stayWith({ buildingId: null })),
      ).resolves.toMatchObject({ canReportIncident: false });
    });

    it('un edificio sin PIN también puede reportar incidencias', async () => {
      const { service } = harness([]);

      await expect(service.getPortalData(stayWith())).resolves.toMatchObject({
        pinState: 'sin-cobertura',
        canReportIncident: true,
      });
    });
  });
});
