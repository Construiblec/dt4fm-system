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

const harness = (credential: Partial<AccessCredential> | null): Harness => {
  const revealPin = jest.fn().mockReturnValue(PIN);
  const credentials = {
    findLiveBySubject: jest.fn().mockResolvedValue(credential),
    revealPin,
  } as unknown as CredentialService;

  return {
    revealPin,
    service: new GuestPortalDataService(
      {} as unknown as Repository<GuestStay>,
      credentials,
    ),
  };
};

const credencial = { id: 'cred-1', syncState: 'synced' as const };

describe('GuestPortalDataService', () => {
  it('muestra el PIN dentro de la ventana de acceso', async () => {
    const { service, revealPin } = harness(credencial);

    const data = await service.getPortalData(stayWith());

    expect(data).toMatchObject({ pinState: 'disponible', pin: PIN });
    expect(revealPin).toHaveBeenCalledTimes(1);
  });

  it('antes del check-in no muestra el PIN, y ni siquiera lo descifra', async () => {
    const { service, revealPin } = harness(credencial);

    const data = await service.getPortalData(
      stayWith({ accessValidFrom: new Date(Date.now() + 24 * HOUR) }),
    );

    expect(data).toMatchObject({ pinState: 'antes-del-checkin', pin: null });
    // Que no se llame es la garantía de que el PIN no sale del cifrado si no
    // se va a mostrar.
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('marca como finalizada la estancia cuyo acceso ya venció', async () => {
    const { service, revealPin } = harness(credencial);

    const data = await service.getPortalData(
      stayWith({ accessValidTo: new Date(Date.now() - HOUR) }),
    );

    expect(data).toMatchObject({ pinState: 'finalizado', pin: null });
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('un edificio sin control de accesos no es un error, es un estado', async () => {
    const { service, revealPin } = harness(null);

    const data = await service.getPortalData(
      stayWith({ buildingId: null, openmaintUnitId: null }),
    );

    expect(data).toMatchObject({
      pinState: 'sin-cobertura',
      pin: null,
      credentialId: null,
      syncState: null,
    });
    expect(revealPin).not.toHaveBeenCalled();
  });

  it('expone el estado de sincronización para diagnóstico', async () => {
    const { service } = harness({ id: 'cred-1', syncState: 'failed' });

    const data = await service.getPortalData(stayWith());

    expect(data.syncState).toBe('failed');
    // `failed` no oculta el PIN: significa que no llegó a la puerta, y el
    // huésped necesita el código igual para cuando alguien lo resuelva.
    expect(data.pin).toBe(PIN);
  });
});
