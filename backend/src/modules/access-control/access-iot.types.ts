/**
 * Contrato con la VPS central de accesos: `openapi.yaml` de la API central
 * (repositorio del gateway), que concreta la guía
 * `docs/accesos y huespedes/guia-servidor-vps-accesos.md` §4.
 */

export type CredentialScopeWire = 'pedestrian' | 'vehicular' | 'both';
export type DeviceScope = 'pedestrian' | 'vehicular';

/** Estado agregado de una escritura. `partial` no es un error. */
export type CredentialWriteState =
  | 'written'
  | 'partial'
  | 'unreachable'
  | 'failed';

/** `deleted` solo aparece en la respuesta del `DELETE`. */
export type DeviceWriteState = 'written' | 'unreachable' | 'failed' | 'deleted';

/** Códigos tipados: distinguen «reintentar» de «regenerar» de «alertar». */
export type AccessIotErrorCode =
  | 'gateway_unreachable'
  | 'gateway_rejected'
  | 'device_unreachable'
  | 'device_unauthorized'
  | 'device_ambiguous'
  | 'no_devices_in_scope'
  | 'pin_conflict'
  | 'device_full'
  | 'not_found'
  | 'unauthorized'
  | 'invalid_request'
  | 'remote_open_disabled'
  | 'internal_error';

export interface AccessIotBuilding {
  buildingId: number;
  code: string;
  name: string;
  online: boolean;
  scopes: DeviceScope[];
  lastSeenAt?: string | null;
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
  lastSeenAt?: string | null;
  /** Solo si el terminal no pudo leerse; aparece con `online: false`, no se omite. */
  errorCode?:
    | 'device_unreachable'
    | 'device_unauthorized'
    | 'device_credential_absent';
}

export interface CredentialDeviceResult {
  deviceId: string;
  state: DeviceWriteState;
  /** Presente en toda entrada `written`: es con lo que concilia el backend. */
  employeeNo?: string;
  /** Presente en toda entrada `failed` y `unreachable`. */
  errorCode?: AccessIotErrorCode;
  at?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface CredentialWriteResult {
  credentialId: string;
  state: CredentialWriteState;
  devices: CredentialDeviceResult[];
  /** Presente en `failed`, y en `partial` si un aparato falló: dice qué hacer a continuación. */
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
  /** Hasta 128 caracteres; más es un `400`. */
  displayName: string;
  unitId?: number | null;
}

export interface AccessIotHealthDevice {
  deviceId: string;
  online: boolean;
  lastSeenAt?: string;
}

/**
 * Debería separar el túnel central ↔ gateway de la LAN gateway ↔ terminal, pero
 * hoy la VPS solo informa el túnel: `devices` llega vacío y el estado por
 * terminal está en `/v1/devices`.
 */
export interface AccessIotHealthBuilding {
  buildingId: number;
  code?: string;
  name?: string;
  siteId?: string;
  gatewayOnline: boolean;
  gatewayLastSeenAt?: string | null;
  /** Versión del contrato del gateway, no la del agente. */
  gatewayVersion?: string | null;
  /** `false` mientras el gateway no cumpla los criterios de habilitación. */
  operationsEnabled?: boolean;
  pendingJobs?: number;
  failedJobs?: number;
  maxClockSkewSeconds?: number | null;
  devices?: AccessIotHealthDevice[];
  errorCode?: 'gateway_unreachable' | 'gateway_invalid_response';
}

export interface AccessIotHealth {
  buildings: AccessIotHealthBuilding[];
}

export type DoorAction = 'open' | 'close';

/** `uncertain`: la orden salió pero nadie confirmó si el relé se activó. */
export type DoorCommandOutcome = 'opened' | 'closed' | 'failed' | 'uncertain';

export const DONE_OUTCOME: Record<DoorAction, DoorCommandOutcome> = {
  open: 'opened',
  close: 'closed',
};

export interface DoorCommandRequest {
  requestId: string;
  /** Solo para el historial de la VPS; nunca autoriza. */
  actor: { type: 'guest' | 'staff'; ref: string };
}

export interface DoorCommandResult {
  outcome: DoorCommandOutcome;
  errorCode?: AccessIotErrorCode;
  at?: string;
}

/** Un registro no gestionado llega solo con `employeeNo` y `managed`. */
export interface InventoryUser {
  employeeNo: string;
  name?: string | null;
  /** `null` si el terminal devolvió la marca sin offset: se reemite el `PUT`. */
  validFrom?: string | null;
  validTo?: string | null;
  /** `true` si lleva el prefijo reservado. Lo que no lo lleva no se toca jamás. */
  managed: boolean;
}

export interface InventoryPage {
  users: InventoryUser[];
  nextCursor?: string | null;
}
