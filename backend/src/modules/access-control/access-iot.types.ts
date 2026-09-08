/**
 * Contrato con la VPS central de accesos. Refleja
 * `docs/accesos y huespedes/mvp-minimo-y-contrato-iot.md` §3.3: si este archivo
 * y ese documento divergen, manda el documento.
 */

export type CredentialScopeWire = 'pedestrian' | 'vehicular' | 'both';
export type DeviceScope = 'pedestrian' | 'vehicular';

/** Estado agregado de una escritura. `partial` no es un error. */
export type CredentialWriteState =
  | 'written'
  | 'partial'
  | 'unreachable'
  | 'failed';

export type DeviceWriteState = 'written' | 'unreachable' | 'failed';

/** Códigos tipados: distinguen «reintentar» de «regenerar» de «alertar». */
export type AccessIotErrorCode =
  | 'gateway_unreachable'
  | 'device_unreachable'
  | 'pin_conflict'
  | 'device_full'
  | 'unauthorized'
  | 'invalid_request';

export interface AccessIotBuilding {
  buildingId: number;
  code: string;
  name: string;
  online: boolean;
  scopes: DeviceScope[];
  lastSeenAt?: string;
}

export interface AccessIotDevice {
  deviceId: string;
  buildingId: number;
  kind: string;
  scope: DeviceScope;
  online: boolean;
  usersUsed?: number;
  usersCapacity?: number;
  firmware?: string;
  clockSkewSeconds?: number;
  lastSeenAt?: string;
}

export interface CredentialDeviceResult {
  deviceId: string;
  state: DeviceWriteState;
  employeeNo?: string;
  error?: string | null;
  at?: string;
}

export interface CredentialWriteResult {
  credentialId: string;
  state: CredentialWriteState;
  devices: CredentialDeviceResult[];
  /** Presente cuando `state` es `failed`: dice qué hacer a continuación. */
  errorCode?: AccessIotErrorCode;
}

export interface PutCredentialRequest {
  buildingId: number;
  scope: CredentialScopeWire;
  /** La VPS lo necesita para derivar el prefijo reservado `DT4-G/T/E-`. */
  subjectType: 'guest' | 'tenant' | 'employee';
  pin: string;
  /** ISO 8601 **con offset**: la hora ingenua no significa nada fuera de su proceso. */
  validFrom: string;
  validTo: string;
  displayName: string;
  unitId?: number | null;
}

export interface AccessIotHealthDevice {
  deviceId: string;
  online: boolean;
  lastSeenAt?: string;
}

/** Separa los dos eslabones: túnel central ↔ gateway, y LAN gateway ↔ terminal. */
export interface AccessIotHealthBuilding {
  buildingId: number;
  gatewayOnline: boolean;
  gatewayLastSeenAt?: string;
  gatewayVersion?: string;
  pendingJobs?: number;
  failedJobs?: number;
  maxClockSkewSeconds?: number;
  devices?: AccessIotHealthDevice[];
}

export interface AccessIotHealth {
  buildings: AccessIotHealthBuilding[];
}

export interface InventoryUser {
  employeeNo: string;
  name?: string;
  validFrom?: string;
  validTo?: string;
  /** `true` si lleva el prefijo reservado. Lo que no lo lleva no se toca jamás. */
  managed: boolean;
}

export interface InventoryPage {
  users: InventoryUser[];
  nextCursor?: string | null;
}
