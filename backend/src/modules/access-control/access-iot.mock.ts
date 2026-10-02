import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotBuilding,
  AccessIotCamera,
  AccessIotDevice,
  AccessIotHealth,
  CredentialDeviceResult,
  CredentialWriteResult,
  InventoryPage,
  InventoryUser,
  LiveSessionRequest,
  LiveSessionResult,
  PutCredentialRequest,
  TriggerRequest,
  TriggerResult,
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

/** `PRA-CAM-02` responde siempre sin cupos: da el camino `live_capacity_reached`. */
const CAMERAS: AccessIotCamera[] = [
  { cameraId: 'ING-CAM-01', name: 'Acceso vehicular', buildingId: 3025058 },
  { cameraId: 'ING-CAM-02', name: 'Lobby', buildingId: 3025058 },
  { cameraId: 'PRA-CAM-01', name: 'Acceso vehicular', buildingId: 3019998 },
  { cameraId: 'PRA-CAM-02', name: 'Parqueadero', buildingId: 3019998 },
];

const FULL_CAMERA_ID = 'PRA-CAM-02';

/**
 * Usuario cargado a mano en el terminal, sin prefijo reservado. Existe para que
 * la conciliación tenga algo que reportar y no tocar, y para que el camino de
 * `pin_conflict` sea alcanzable sin trucar nada.
 */
const MANUAL_USERS: Record<string, { employeeNo: string; pin: string }[]> = {
  'ING-PEATONAL-1': [{ employeeNo: '77', pin: '4821' }],
};

/** UUID canónico en minúsculas, con guiones y sin llaves, como exige `trigger`. */
const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  private readonly triggers = new Map<string, TriggerResult>();

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

    // La API responde 400 `invalid_request`; el cliente HTTP lo traduce a esto.
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
            errorCode: 'device_unreachable',
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
      (device) => ({ deviceId: device.deviceId, state: 'deleted' }),
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
        code: building.code,
        name: building.name,
        siteId: building.code.toLowerCase(),
        gatewayOnline: true,
        gatewayLastSeenAt: new Date().toISOString(),
        gatewayVersion: 'v1',
        operationsEnabled: true,
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

  /**
   * Como el gateway: solo la barrera vehicular, solo `{ requestId }`, y
   * deduplica por `(deviceId, requestId)`, así que repetir no da un segundo pulso.
   */
  triggerDevice(
    deviceId: string,
    request: TriggerRequest,
  ): Promise<TriggerResult> {
    const extra = Object.keys(request).filter((key) => key !== 'requestId');

    if (extra.length > 0 || !CANONICAL_UUID.test(request.requestId)) {
      return Promise.resolve({
        outcome: 'failed',
        errorCode: 'invalid_request',
      });
    }

    const key = `${deviceId}:${request.requestId}`;
    const previous = this.triggers.get(key);

    if (previous) return Promise.resolve(previous);

    const device = DEVICES.find((candidate) => candidate.deviceId === deviceId);
    const result: TriggerResult = !device
      ? { outcome: 'failed', errorCode: 'not_found' }
      : device.kind !== 'barrier' || device.scope !== 'vehicular'
        ? { outcome: 'failed', errorCode: 'device_not_compatible' }
        : !device.online
          ? { outcome: 'failed', errorCode: 'device_unreachable' }
          : { outcome: 'triggered' };

    this.triggers.set(key, result);
    this.logger.log(`Pulso simulado en ${deviceId}: ${result.outcome}`);

    return Promise.resolve(result);
  }

  listCameras(buildingId?: number): Promise<AccessIotCamera[]> {
    return Promise.resolve(
      CAMERAS.filter(
        (camera) => buildingId == null || camera.buildingId === buildingId,
      ),
    );
  }

  /** La sesión es ficticia: el `ticket` no negocia contra el hostname de video real. */
  createLiveSession(
    cameraId: string,
    request: LiveSessionRequest,
  ): Promise<LiveSessionResult> {
    const extra = Object.keys(request).filter((key) => key !== 'requestId');
    const camera = CAMERAS.find((candidate) => candidate.cameraId === cameraId);

    if (extra.length > 0 || !CANONICAL_UUID.test(request.requestId)) {
      return Promise.resolve({
        outcome: 'failed',
        errorCode: 'invalid_request',
      });
    }

    if (!camera) {
      return Promise.resolve({ outcome: 'failed', errorCode: 'not_found' });
    }

    if (camera.cameraId === FULL_CAMERA_ID) {
      return Promise.resolve({
        outcome: 'failed',
        errorCode: 'live_capacity_reached',
      });
    }

    this.logger.log(`Sesión en vivo simulada en ${cameraId}`);

    return Promise.resolve({
      outcome: 'issued',
      session: {
        requestId: request.requestId,
        cameraId,
        buildingId: camera.buildingId,
        whepUrl: `https://live.construiblec.cloud/v1/live/${cameraId}/whep`,
        ticket: `mock-${randomUUID()}`,
        ticketExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxDurationSeconds: 300,
        iceServers: [
          {
            urls: ['turn:turn.cloudflare.com:3478?transport=udp'],
            username: 'mock',
            credential: 'mock',
          },
        ],
        iceTransportPolicy: 'relay',
      },
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

  /**
   * Deriva el identificador como hará la VPS: `DT4<X><8 HEX>`. Sin separadores
   * porque Hikvision solo admite letras y números.
   */
  private employeeNo(
    credentialId: string,
    subjectType: PutCredentialRequest['subjectType'],
  ): string {
    const digest = createHash('sha256')
      .update(credentialId)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    return `DT4${PREFIX_BY_SUBJECT[subjectType]}${digest}`;
  }
}
