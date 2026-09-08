import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotBuilding,
  AccessIotDevice,
  AccessIotHealth,
  CredentialDeviceResult,
  CredentialWriteResult,
  InventoryPage,
  InventoryUser,
  PutCredentialRequest,
} from './access-iot.types';

/**
 * Los `_id` salen de `OPENMAINT_IOT_FALLBACK_SITE_ID` en `.env.example`. Son
 * ilustrativos: lo que importa es que Batán y Republica NO figuren, porque no
 * tienen puertas con PIN.
 */
const BUILDINGS: AccessIotBuilding[] = [
  {
    buildingId: 3025058,
    code: 'ING',
    name: 'Inglaterra',
    online: true,
    scopes: ['pedestrian', 'vehicular'],
  },
  {
    buildingId: 3019998,
    code: 'PRA',
    name: 'Pradera',
    online: true,
    scopes: ['pedestrian', 'vehicular'],
  },
];

/** `PRA-VEHICULAR-1` está caído a propósito: da un camino `partial` reproducible. */
const DEVICES: AccessIotDevice[] = [
  {
    deviceId: 'ING-PEATONAL-1',
    buildingId: 3025058,
    kind: 'terminal',
    scope: 'pedestrian',
    online: true,
    usersUsed: 812,
    usersCapacity: 3000,
  },
  {
    deviceId: 'ING-VEHICULAR-1',
    buildingId: 3025058,
    kind: 'barrier',
    scope: 'vehicular',
    online: true,
    usersUsed: 240,
    usersCapacity: 3000,
  },
  {
    deviceId: 'PRA-PEATONAL-1',
    buildingId: 3019998,
    kind: 'terminal',
    scope: 'pedestrian',
    online: true,
    usersUsed: 415,
    usersCapacity: 3000,
  },
  {
    deviceId: 'PRA-VEHICULAR-1',
    buildingId: 3019998,
    kind: 'barrier',
    scope: 'vehicular',
    online: false,
    usersUsed: 96,
    usersCapacity: 3000,
  },
];

/**
 * Usuario cargado a mano en el terminal, sin prefijo reservado. Existe para que
 * la conciliación tenga algo que reportar y no tocar, y para que el camino de
 * `pin_conflict` sea alcanzable sin trucar nada.
 */
const MANUAL_USERS: Record<string, { employeeNo: string; pin: string }[]> = {
  'ING-PEATONAL-1': [{ employeeNo: 'LOCAL-77', pin: '4821' }],
};

const PREFIX_BY_SUBJECT = { guest: 'G', tenant: 'T', employee: 'E' } as const;

interface StoredCredential {
  request: PutCredentialRequest;
  devices: CredentialDeviceResult[];
}

/**
 * Implementación en memoria del contrato de la VPS, para desarrollar y probar
 * mientras no exista. Es la referencia ejecutable de
 * `docs/accesos y huespedes/guia-servidor-vps-accesos.md` §4.
 */
@Injectable()
export class AccessIotMockGateway extends AccessIotGateway {
  private readonly logger = new Logger(AccessIotMockGateway.name);
  private readonly store = new Map<string, StoredCredential>();

  listBuildings(): Promise<AccessIotBuilding[]> {
    return Promise.resolve(BUILDINGS);
  }

  listDevices(): Promise<AccessIotDevice[]> {
    return Promise.resolve(DEVICES);
  }

  putCredential(
    credentialId: string,
    request: PutCredentialRequest,
  ): Promise<CredentialWriteResult> {
    const targets = this.devicesFor(request.buildingId, request.scope);

    if (targets.length === 0) {
      return Promise.resolve({
        credentialId,
        state: 'failed',
        devices: [],
        errorCode: 'invalid_request',
      });
    }

    const conflict = targets.find((device) =>
      (MANUAL_USERS[device.deviceId] ?? []).some(
        (user) => user.pin === request.pin,
      ),
    );

    if (conflict) {
      this.logger.warn(
        `PIN duplicado con un usuario manual en ${conflict.deviceId}`,
      );

      return Promise.resolve({
        credentialId,
        state: 'failed',
        devices: [],
        errorCode: 'pin_conflict',
      });
    }

    const devices: CredentialDeviceResult[] = targets.map((device) =>
      device.online
        ? {
            deviceId: device.deviceId,
            state: 'written',
            employeeNo: this.employeeNo(credentialId, request.subjectType),
            at: new Date().toISOString(),
          }
        : {
            deviceId: device.deviceId,
            state: 'unreachable',
            error: 'link down',
          },
    );

    this.store.set(credentialId, { request, devices });

    return Promise.resolve({
      credentialId,
      state: this.aggregate(devices),
      devices,
    });
  }

  deleteCredential(credentialId: string): Promise<CredentialWriteResult> {
    const stored = this.store.get(credentialId);
    this.store.delete(credentialId);

    // Idempotente: borrar algo ya borrado es éxito, no 404.
    const devices: CredentialDeviceResult[] = (stored?.devices ?? []).map(
      (device) => ({ deviceId: device.deviceId, state: 'written' }),
    );

    return Promise.resolve({ credentialId, state: 'written', devices });
  }

  getCredential(credentialId: string): Promise<CredentialWriteResult | null> {
    const stored = this.store.get(credentialId);

    if (!stored) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      credentialId,
      state: this.aggregate(stored.devices),
      devices: stored.devices,
    });
  }

  getHealth(): Promise<AccessIotHealth> {
    return Promise.resolve({
      buildings: BUILDINGS.map((building) => ({
        buildingId: building.buildingId,
        gatewayOnline: true,
        gatewayLastSeenAt: new Date().toISOString(),
        gatewayVersion: '0.0.0-mock',
        pendingJobs: 0,
        failedJobs: 0,
        maxClockSkewSeconds: 1,
        devices: DEVICES.filter(
          (device) => device.buildingId === building.buildingId,
        ).map((device) => ({
          deviceId: device.deviceId,
          online: device.online,
        })),
      })),
    });
  }

  getDeviceInventory(deviceId: string): Promise<InventoryPage> {
    const manual: InventoryUser[] = (MANUAL_USERS[deviceId] ?? []).map(
      (user) => ({ employeeNo: user.employeeNo, managed: false }),
    );

    const managed: InventoryUser[] = [...this.store.entries()]
      .filter(([, stored]) =>
        stored.devices.some(
          (device) =>
            device.deviceId === deviceId && device.state === 'written',
        ),
      )
      .map(([credentialId, stored]) => ({
        employeeNo: this.employeeNo(credentialId, stored.request.subjectType),
        name: stored.request.displayName,
        validFrom: stored.request.validFrom,
        validTo: stored.request.validTo,
        managed: true,
      }));

    return Promise.resolve({
      users: [...manual, ...managed],
      nextCursor: null,
    });
  }

  private devicesFor(
    buildingId: number,
    scope: PutCredentialRequest['scope'],
  ): AccessIotDevice[] {
    return DEVICES.filter(
      (device) =>
        device.buildingId === buildingId &&
        (scope === 'both' || device.scope === scope),
    );
  }

  private aggregate(
    devices: CredentialDeviceResult[],
  ): CredentialWriteResult['state'] {
    const written = devices.filter(
      (device) => device.state === 'written',
    ).length;

    if (written === devices.length) return 'written';
    if (written === 0) return 'unreachable';

    return 'partial';
  }

  /** Deriva el identificador del terminal igual que hará la VPS: `DT4-<X>-<8 hex>`. */
  private employeeNo(
    credentialId: string,
    subjectType: PutCredentialRequest['subjectType'],
  ): string {
    const digest = createHash('sha256')
      .update(credentialId)
      .digest('hex')
      .slice(0, 8);

    return `DT4-${PREFIX_BY_SUBJECT[subjectType]}-${digest}`;
  }
}
