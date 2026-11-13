import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AccessIotMockGateway } from './access-iot.mock';
import { BuildingCatalogService } from './building-catalog.service';
import { deriveEmployeeNo } from './credential-scopes';
import {
  CredentialService,
  IssueCredentialInput,
  PIN_CONFLICT_ERROR,
  SITE_FROZEN_ERROR,
} from './credential.service';
import {
  AccessCredential,
  CredentialScope,
} from './entities/access-credential.entity';
import { PinCipherService } from './pin-cipher.service';
import { PinGeneratorService } from './pin-generator.service';

const ING = 3025058;
const PRA = 3019998;

const input = (
  overrides: Partial<IssueCredentialInput> = {},
): IssueCredentialInput => ({
  subjectType: 'guest',
  subjectRef: '90000002',
  displayName: 'Bruno Salas',
  scope: 'pedestrian',
  buildingId: ING,
  validFrom: new Date('2026-11-10T19:00:00Z'),
  validTo: new Date('2026-12-16T17:00:00Z'),
  issuedBy: 'test',
  ...overrides,
});

/** Repositorio en memoria: `findOne` por id, el resto vacío. */
const harness = (scopedSites: string | undefined) => {
  const rows = new Map<string, AccessCredential>();
  const repo = {
    findOne: jest.fn(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id ? (rows.get(where.id) ?? null) : null),
    ),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((data: Partial<AccessCredential>) => ({
      id: randomUUID(),
      syncDetail: null,
      employeeNo: null,
      rewritePending: false,
      syncError: null,
      lastSyncedAt: null,
      ...data,
    })),
    save: jest.fn((credential: AccessCredential) => {
      rows.set(credential.id, credential);
      return Promise.resolve(credential);
    }),
  };
  const gateway = new AccessIotMockGateway();
  const put = jest.spyOn(gateway, 'putCredential');
  const del = jest.spyOn(gateway, 'deleteCredential');
  const pins = ['1234', '5678', '9012'];
  const generator = {
    generate: jest.fn(() => {
      const pin = pins.shift()!;
      return Promise.resolve({ pin, fingerprint: `fp-${pin}` });
    }),
  };
  const cipher = {
    encrypt: (pin: string) => `enc:${pin}`,
    decrypt: (value: string) => value.slice(4),
  };
  const config = {
    get: (key: string) =>
      key === 'ACCESS_SCOPED_SITES' ? scopedSites : undefined,
  };

  const service = new CredentialService(
    repo as unknown as Repository<AccessCredential>,
    generator as unknown as PinGeneratorService,
    cipher as unknown as PinCipherService,
    new BuildingCatalogService(gateway),
    gateway,
    config as unknown as ConfigService,
  );
  jest
    .spyOn(service as unknown as { withLock: unknown }, 'withLock' as never)
    .mockImplementation(((_id: string, work: () => Promise<unknown>) =>
      work()) as never);

  const issue = async (scope: CredentialScope = 'pedestrian') => {
    const credential = await service.issue(input({ scope }));
    put.mockClear();
    del.mockClear();
    return credential;
  };

  return { service, gateway, put, del, generator, issue, rows };
};

describe('CredentialService', () => {
  describe('con ACCESS_SCOPED_SITES (contrato por scopes)', () => {
    it('el alta peatonal confirma el scope y guarda el employeeNo exacto', async () => {
      const { service, put } = harness('ing');

      const credential = await service.issue(input());

      expect(put).toHaveBeenCalledTimes(1);
      expect(put.mock.calls[0][1].scope).toBe('pedestrian');
      expect(credential).toMatchObject({
        status: 'active',
        syncState: 'synced',
        confirmedScopes: ['pedestrian'],
        employeeNo: deriveEmployeeNo(credential.id, 'guest'),
      });
    });

    it('peatonal → ambos: un PUT vehicular con el mismo PIN y ningún DELETE', async () => {
      const { service, put, del, issue } = harness('ing');
      const credential = await issue();

      const result = await service.changeScope(credential.id, 'both');

      expect(put).toHaveBeenCalledTimes(1);
      expect(put.mock.calls[0][1]).toMatchObject({
        scope: 'vehicular',
        pin: '1234',
      });
      expect(del).not.toHaveBeenCalled();
      expect(result.confirmedScopes).toEqual(['pedestrian', 'vehicular']);
      expect(result.syncState).toBe('synced');
    });

    it('ambos → peatonal: solo un DELETE vehicular con siteId y employeeNo', async () => {
      const { service, put, del, issue, gateway } = harness('ing');
      const credential = await issue('both');

      const result = await service.changeScope(credential.id, 'pedestrian');

      expect(put).not.toHaveBeenCalled();
      expect(del).toHaveBeenCalledWith(credential.id, {
        siteId: 'ing',
        employeeNo: deriveEmployeeNo(credential.id, 'guest'),
        scopes: ['vehicular'],
      });
      expect(result.confirmedScopes).toEqual(['pedestrian']);
      const enPuertas = (await gateway.getCredential(credential.id))!.devices;
      expect(enPuertas.map((device) => device.deviceId)).toEqual([
        'ING-PEATONAL-1',
      ]);
    });

    it('ambos → vehicular: solo un DELETE peatonal', async () => {
      const { service, put, del, issue } = harness('ing');
      const credential = await issue('both');

      await service.changeScope(credential.id, 'vehicular');

      expect(put).not.toHaveBeenCalled();
      expect(del.mock.calls[0][1]?.scopes).toEqual(['pedestrian']);
    });

    it('peatonal → vehicular: primero el PUT nuevo y después el DELETE viejo', async () => {
      const { service, put, del, issue } = harness('ing');
      const credential = await issue();

      const result = await service.changeScope(credential.id, 'vehicular');

      expect(put.mock.calls[0][1].scope).toBe('vehicular');
      expect(del.mock.calls[0][1]?.scopes).toEqual(['pedestrian']);
      expect(put.mock.invocationCallOrder[0]).toBeLessThan(
        del.mock.invocationCallOrder[0],
      );
      expect(result.confirmedScopes).toEqual(['vehicular']);
    });

    it('si el PUT del cambio no llega, no retira el acceso que funciona', async () => {
      const { service, put, del, issue } = harness('ing');
      const credential = await issue();
      put.mockResolvedValueOnce({
        credentialId: credential.id,
        state: 'unreachable',
        devices: [
          {
            deviceId: 'ING-VEHICULAR-1',
            state: 'unreachable',
            errorCode: 'device_unreachable',
          },
        ],
      });

      const result = await service.changeScope(credential.id, 'vehicular');

      expect(del).not.toHaveBeenCalled();
      expect(result.confirmedScopes).toEqual(['pedestrian']);
      expect(result.syncState).toBe('pending');
    });

    it('repetir un ámbito ya confirmado no genera operaciones', async () => {
      const { service, put, del, issue } = harness('ing');
      const credential = await issue();

      await service.changeScope(credential.id, 'pedestrian');

      expect(put).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
    });

    it('un `partial` solo confirma los scopes con todos sus aparatos escritos', async () => {
      const { service, put, issue } = harness('ing');
      const credential = await issue();
      put.mockResolvedValueOnce({
        credentialId: credential.id,
        state: 'partial',
        devices: [
          {
            deviceId: 'ING-VEHICULAR-1',
            state: 'unreachable',
            errorCode: 'device_unreachable',
          },
        ],
      });

      const result = await service.changeScope(credential.id, 'both');

      expect(result.confirmedScopes).toEqual(['pedestrian']);
      expect(result.syncState).toBe('pending');
    });

    it('`pin_conflict` al ampliar aborta sin rotar el PIN', async () => {
      const { service, put, generator, issue, rows } = harness('ing');
      const credential = await issue();
      generator.generate.mockClear();
      put.mockResolvedValueOnce({
        credentialId: credential.id,
        state: 'failed',
        devices: [],
        errorCode: 'pin_conflict',
      });

      await expect(service.changeScope(credential.id, 'both')).rejects.toThrow(
        ConflictException,
      );

      const guardada = rows.get(credential.id)!;
      expect(put).toHaveBeenCalledTimes(1);
      expect(generator.generate).not.toHaveBeenCalled();
      expect(guardada).toMatchObject({
        scope: 'pedestrian',
        confirmedScopes: ['pedestrian'],
        pinCiphertext: 'enc:1234',
        syncState: 'synced',
        syncError: PIN_CONFLICT_ERROR,
      });
    });

    it('revocar retira los dos scopes en un DELETE', async () => {
      const { service, del, issue } = harness('ing');
      const credential = await issue('both');

      const result = await service.revoke(credential.id, 'manual');

      expect(del.mock.calls[0][1]?.scopes).toEqual(['pedestrian', 'vehicular']);
      expect(result).toMatchObject({
        status: 'revoked',
        syncState: 'synced',
        confirmedScopes: [],
      });
    });

    it('un DELETE fallido deja la credencial en `failed` sin dar por retirado el scope', async () => {
      const { service, del, issue } = harness('ing');
      const credential = await issue('both');
      del.mockResolvedValueOnce({
        credentialId: credential.id,
        state: 'failed',
        devices: [],
        errorCode: 'gateway_rejected',
      });

      const result = await service.changeScope(credential.id, 'pedestrian');

      expect(result.syncState).toBe('failed');
      expect(result.confirmedScopes).toEqual(['pedestrian', 'vehicular']);
    });

    it('un cambio de fechas reescribe todos los scopes con el mismo PIN', async () => {
      const { service, put, issue } = harness('ing');
      const credential = await issue('both');

      const result = await service.reschedule(
        credential.id,
        new Date('2026-11-11T19:00:00Z'),
        new Date('2026-12-17T17:00:00Z'),
      );

      expect(put).toHaveBeenCalledTimes(1);
      expect(put.mock.calls[0][1]).toMatchObject({
        scope: 'both',
        pin: '1234',
      });
      expect(result.rewritePending).toBe(false);
      expect(result.syncState).toBe('synced');
    });

    it('un sitio fuera de la lista no recibe ninguna mutación', async () => {
      const { service, put, del } = harness('ing');

      const credential = await service.issue(input({ buildingId: PRA }));
      await service.revoke(credential.id, 'manual');

      expect(put).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
      expect(credential).toMatchObject({
        syncState: 'pending',
        syncError: SITE_FROZEN_ERROR,
      });
      await expect(service.frozenBuildingIds()).resolves.toEqual([PRA]);
    });
  });

  describe('sin ACCESS_SCOPED_SITES (contrato anterior)', () => {
    it('reduce con un PUT del ámbito completo y revoca con un DELETE sin body', async () => {
      const { service, put, del, issue } = harness(undefined);
      const credential = await issue('both');

      const reducida = await service.changeScope(credential.id, 'pedestrian');

      expect(put.mock.calls[0][1].scope).toBe('pedestrian');
      // El PUT solo añade: vehicular sigue confirmado aunque ya no se pida.
      expect(reducida.confirmedScopes).toEqual(['pedestrian', 'vehicular']);

      await service.revoke(credential.id, 'manual');
      expect(del).toHaveBeenCalledWith(credential.id);
      await expect(service.frozenBuildingIds()).resolves.toEqual([]);
    });
  });
});
