import {
  AccessIotBuilding,
  AccessIotDevice,
  AccessIotHealth,
  CredentialWriteResult,
  InventoryPage,
  PutCredentialRequest,
} from './access-iot.types';

/**
 * Única superficie por la que el backend habla con la VPS central. Es una clase
 * abstracta y no una interfaz para que sirva de token de inyección: el módulo
 * resuelve a la implementación HTTP o a la de memoria según
 * `ACCESS_IOT_USE_MOCK`, y las suites E2E la sustituyen por su propio doble.
 */
export abstract class AccessIotGateway {
  abstract listBuildings(): Promise<AccessIotBuilding[]>;

  abstract listDevices(): Promise<AccessIotDevice[]>;

  /** Idempotente: reenviarlo con el mismo cuerpo deja el mismo resultado. */
  abstract putCredential(
    credentialId: string,
    request: PutCredentialRequest,
  ): Promise<CredentialWriteResult>;

  /** Idempotente: borrar algo ya borrado es éxito, no `404`. */
  abstract deleteCredential(
    credentialId: string,
  ): Promise<CredentialWriteResult>;

  /** Lo que la VPS ve hoy en el dispositivo, no lo que cree recordar. */
  abstract getCredential(
    credentialId: string,
  ): Promise<CredentialWriteResult | null>;

  abstract getHealth(): Promise<AccessIotHealth>;

  abstract getDeviceInventory(
    deviceId: string,
    cursor?: string,
  ): Promise<InventoryPage>;
}
