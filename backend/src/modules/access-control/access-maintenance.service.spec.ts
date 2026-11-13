import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AccessIotGateway } from './access-iot.gateway';
import { AccessIotDevice } from './access-iot.types';
import { AccessMaintenanceService } from './access-maintenance.service';
import { deriveEmployeeNo } from './credential-scopes';
import { CredentialService } from './credential.service';
import { AccessCredential } from './entities/access-credential.entity';

const ING = 3025058;
const BARRERA: AccessIotDevice = {
  deviceId: 'ING-VEHICULAR-1',
  buildingId: ING,
  kind: 'barrier',
  scope: 'vehicular',
  online: true,
};

const credencial = (overrides: Partial<AccessCredential>): AccessCredential =>
  ({
    id: '3f9a2b11-7c4e-4d2a-9b61-5e8f0a1c2d34',
    subjectType: 'guest',
    scope: 'pedestrian',
    buildingId: ING,
    status: 'active',
    syncState: 'synced',
    confirmedScopes: ['pedestrian'],
    employeeNo: null,
    syncDetail: [],
    ...overrides,
  }) as AccessCredential;

const harness = (candidatas: AccessCredential[], scoped = true) => {
  const update = jest.fn().mockResolvedValue(undefined);
  const find = jest
    .fn()
    // Primero las vivas sincronizadas, después las candidatas del edificio.
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(candidatas);
  const iot = {
    getDeviceInventory: jest.fn().mockResolvedValue({
      users: candidatas.map((c) => ({
        employeeNo: deriveEmployeeNo(c.id, c.subjectType),
        managed: true,
      })),
      nextCursor: null,
    }),
  };
  const service = new AccessMaintenanceService(
    { find, update } as unknown as Repository<AccessCredential>,
    {
      isScoped: jest.fn().mockResolvedValue(scoped),
    } as unknown as CredentialService,
    iot as unknown as AccessIotGateway,
    {} as ConfigService,
  );

  return { service, update };
};

describe('AccessMaintenanceService.reconcileDevice', () => {
  it('un PIN en la barrera sin vehicular pedido se anota para retirarlo', async () => {
    const reducida = credencial({});
    const { service, update } = harness([reducida]);

    await service.reconcileDevice(BARRERA.deviceId, BARRERA);

    expect(update).toHaveBeenCalledWith(reducida.id, {
      confirmedScopes: ['pedestrian', 'vehicular'],
      syncState: 'pending',
      syncAttempts: 0,
    });
  });

  it('una revocada que sigue en la barrera también', async () => {
    const revocada = credencial({ status: 'revoked', confirmedScopes: [] });
    const { service, update } = harness([revocada]);

    await service.reconcileDevice(BARRERA.deviceId, BARRERA);

    expect(update).toHaveBeenCalledWith(
      revocada.id,
      expect.objectContaining({ confirmedScopes: ['vehicular'] }),
    );
  });

  it('no toca a quien tiene vehicular pedido', async () => {
    const { service, update } = harness([credencial({ scope: 'both' })]);

    await service.reconcileDevice(BARRERA.deviceId, BARRERA);

    expect(update).not.toHaveBeenCalled();
  });

  it('con el contrato anterior no corrige scopes sobrantes', async () => {
    const { service, update } = harness([credencial({})], false);

    await service.reconcileDevice(BARRERA.deviceId, BARRERA);

    expect(update).not.toHaveBeenCalled();
  });
});
