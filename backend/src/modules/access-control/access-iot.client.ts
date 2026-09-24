import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AccessIotGateway } from './access-iot.gateway';
import {
  AccessIotBuilding,
  AccessIotDevice,
  AccessIotErrorCode,
  AccessIotHealth,
  CredentialWriteResult,
  InventoryPage,
  DONE_OUTCOME,
  DoorAction,
  DoorCommandRequest,
  DoorCommandResult,
  PutCredentialRequest,
} from './access-iot.types';

/**
 * Códigos que son un desenlace de negocio y no un fallo de transporte: el
 * llamante tiene que reaccionar a ellos, no reintentarlos a ciegas.
 */
const BUSINESS_ERROR_CODES: AccessIotErrorCode[] = [
  'pin_conflict',
  'device_full',
];

// La petición pudo llegar y mover el relé antes de cortarse: no se sabe qué pasó.
const UNCERTAIN_NETWORK_CODES = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'];

interface ErrorBody {
  code?: AccessIotErrorCode;
  message?: string;
}

interface DoorCommandResponse {
  state?: 'opened' | 'closed' | 'uncertain';
  at?: string | null;
}

const isCredentialResult = (data: CredentialWriteResult): boolean =>
  typeof data?.state === 'string' && Array.isArray(data?.devices);

/**
 * Un código tipado o un 4xx es un no seguro; un 5xx sin código o un corte a
 * medias, incierto. `internal_error` tampoco garantiza que la orden no saliera.
 */
export const classifyCommandError = (error: unknown): DoorCommandResult => {
  const axiosError = error as AxiosError<ErrorBody> | undefined;
  const code = axiosError?.response?.data?.code;

  if (code) {
    return {
      outcome: code === 'internal_error' ? 'uncertain' : 'failed',
      errorCode: code,
    };
  }

  const status = axiosError?.response?.status;

  if (status != null) {
    return { outcome: status >= 500 ? 'uncertain' : 'failed' };
  }

  return {
    outcome: UNCERTAIN_NETWORK_CODES.includes(axiosError?.code ?? '')
      ? 'uncertain'
      : 'failed',
  };
};

@Injectable()
export class AccessIotClient extends AccessIotGateway {
  private readonly logger = new Logger(AccessIotClient.name);
  private readonly requestTimeoutMs = 15_000;
  private readonly commandTimeoutMs = 8_000;
  private readonly maxRetries = 2;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async listBuildings(): Promise<AccessIotBuilding[]> {
    const operation = 'GET /v1/buildings';
    const { data } = await this.request<AccessIotBuilding[]>(operation, {
      method: 'GET',
      url: '/v1/buildings',
    });

    return this.ensure(operation, data, (body) => Array.isArray(body));
  }

  async listDevices(): Promise<AccessIotDevice[]> {
    const operation = 'GET /v1/devices';
    const { data } = await this.request<AccessIotDevice[]>(operation, {
      method: 'GET',
      url: '/v1/devices',
    });

    return this.ensure(operation, data, (body) => Array.isArray(body));
  }

  async putCredential(
    credentialId: string,
    request: PutCredentialRequest,
  ): Promise<CredentialWriteResult> {
    return this.writeCredential(`PUT /v1/credentials/${credentialId}`, {
      method: 'PUT',
      url: `/v1/credentials/${encodeURIComponent(credentialId)}`,
      data: request,
    });
  }

  async deleteCredential(credentialId: string): Promise<CredentialWriteResult> {
    return this.writeCredential(`DELETE /v1/credentials/${credentialId}`, {
      method: 'DELETE',
      url: `/v1/credentials/${encodeURIComponent(credentialId)}`,
    });
  }

  async getCredential(
    credentialId: string,
  ): Promise<CredentialWriteResult | null> {
    const operation = `GET /v1/credentials/${credentialId}`;

    try {
      const { data } = await this.withRetries<CredentialWriteResult>(
        operation,
        {
          method: 'GET',
          url: `/v1/credentials/${encodeURIComponent(credentialId)}`,
        },
      );

      return this.ensure(operation, data, isCredentialResult);
    } catch (error) {
      // Si algún gateway no respondió llega un 200 `unreachable`, nunca un 404.
      if (this.errorCodeOf(error) === 'not_found') {
        return null;
      }

      throw this.translate(error);
    }
  }

  async getHealth(): Promise<AccessIotHealth> {
    const operation = 'GET /v1/health';
    const { data } = await this.request<AccessIotHealth>(operation, {
      method: 'GET',
      url: '/v1/health',
    });

    return this.ensure(operation, data, (body) =>
      Array.isArray(body?.buildings),
    );
  }

  /** Nunca una página corta: la conciliación la leería como credenciales ausentes. */
  async getDeviceInventory(
    deviceId: string,
    cursor?: string,
  ): Promise<InventoryPage> {
    const operation = `GET /v1/devices/${deviceId}/inventory`;
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const { data } = await this.request<InventoryPage>(operation, {
      method: 'GET',
      url: `/v1/devices/${encodeURIComponent(deviceId)}/inventory${query}`,
    });

    return this.ensure(operation, data, (body) => Array.isArray(body?.users));
  }

  async commandDevice(
    deviceId: string,
    action: DoorAction,
    request: DoorCommandRequest,
  ): Promise<DoorCommandResult> {
    const operation = `POST /v1/devices/${deviceId}/${action}`;

    try {
      const response = await this.send<DoorCommandResponse>(
        {
          method: 'POST',
          url: `/v1/devices/${encodeURIComponent(deviceId)}/${action}`,
          data: request,
        },
        this.commandTimeoutMs,
      );
      const { state, at } = response.data ?? {};
      const done = DONE_OUTCOME[action];

      return {
        outcome: state === done ? done : 'uncertain',
        at: at ?? undefined,
      };
    } catch (error) {
      const result = classifyCommandError(error);
      const detail =
        this.buildSafeErrorMessage(error) || (error as Error).message;

      this.logger.warn(`${operation} -> ${result.outcome} (${detail})`);

      return result;
    }
  }

  /**
   * Una escritura devuelve su desenlace en el cuerpo. `pin_conflict` y
   * `device_full` también pueden llegar como error HTTP, e `invalid_request`
   * no se arregla reintentando: los tres vuelven como `failed`. Lo demás sube
   * como excepción, porque es configuración o red.
   */
  private async writeCredential(
    operation: string,
    config: AxiosRequestConfig,
  ): Promise<CredentialWriteResult> {
    try {
      const { data } = await this.withRetries<CredentialWriteResult>(
        operation,
        config,
      );

      return this.ensure(operation, data, isCredentialResult);
    } catch (error) {
      const code = this.errorCodeOf(error);

      if (
        code &&
        (BUSINESS_ERROR_CODES.includes(code) || code === 'invalid_request')
      ) {
        this.logger.warn(
          `${operation} devolvió ${code} (${this.buildSafeErrorMessage(error)})`,
        );

        return {
          credentialId: '',
          state: 'failed',
          devices: [],
          errorCode: code,
        };
      }

      throw this.translate(error);
    }
  }

  private send<T>(
    config: AxiosRequestConfig,
    timeoutMs: number,
  ): Promise<AxiosResponse<T>> {
    const token = this.token();

    return firstValueFrom(
      this.httpService.request<T>({
        ...config,
        baseURL: this.baseUrl(),
        timeout: timeoutMs,
        // Con el token inválido, Cloudflare responde un 302 a su login: seguirlo
        // devolvería un 200 con HTML en lugar del error.
        maxRedirects: 0,
        headers: {
          ...(config.headers ?? {}),
          // Service token de Cloudflare Access: no hay lista blanca de IP
          // porque Render no garantiza IP de salida.
          'CF-Access-Client-Id': token.clientId,
          'CF-Access-Client-Secret': token.clientSecret,
        },
      }),
    );
  }

  private async request<T>(
    operation: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      return await this.withRetries<T>(operation, config);
    } catch (error) {
      throw this.translate(error);
    }
  }

  /** Lanza el error de axios sin traducir, para que el llamante lea su `code`. */
  private async withRetries<T>(
    operation: string,
    config: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    // Se validan antes del bucle: una configuración ausente no se reintenta.
    this.baseUrl();
    this.token();

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        return await this.send<T>(config, this.requestTimeoutMs);
      } catch (error) {
        lastError = error;
        const safeMessage = this.buildSafeErrorMessage(error);
        const shouldRetry =
          attempt <= this.maxRetries && this.isRetryableError(error);

        this.logger.warn(
          `${operation} falló en intento ${attempt}/${this.maxRetries + 1}` +
            (safeMessage ? ` -> ${safeMessage}` : ''),
        );

        if (!shouldRetry) break;

        await this.delay(attempt * 1_500);
      }
    }

    throw lastError;
  }

  /** Un 200 fuera de contrato no puede leerse como una lista vacía. */
  private ensure<T>(
    operation: string,
    data: T,
    valid: (data: T) => boolean,
  ): T {
    if (!valid(data)) {
      throw new BadGatewayException(
        `${operation}: la VPS de accesos respondió fuera de contrato`,
      );
    }

    return data;
  }

  private translate(error: unknown): Error {
    if (error instanceof HttpException) return error;

    const safeMessage = this.buildSafeErrorMessage(error);
    const code = this.errorCodeOf(error);
    const status = this.statusOf(error);

    if (
      code === 'unauthorized' ||
      status === 401 ||
      status === 403 ||
      (status != null && status >= 300 && status < 400)
    ) {
      return new ServiceUnavailableException(
        `La VPS de accesos rechazó el service token (${safeMessage})`,
      );
    }

    // invalid_request es un error nuestro, no suyo: hay que verlo como avería.
    if (code === 'invalid_request' || status === 400) {
      return new BadGatewayException(
        `La VPS de accesos rechazó la petición (${safeMessage})`,
      );
    }

    return new ServiceUnavailableException(
      `No fue posible completar la operación con la VPS de accesos (${safeMessage})`,
    );
  }

  private isRetryableError(error: unknown): boolean {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const code = this.errorCodeOf(error);

    // Un edificio incomunicado sí se reintenta; un PIN duplicado, nunca.
    if (code && BUSINESS_ERROR_CODES.includes(code)) return false;
    if (code === 'unauthorized' || code === 'invalid_request') return false;

    if (status === 401 || status === 403) return false;
    if (status != null) return status >= 500 || status === 429;

    return [
      'ECONNABORTED',
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ERR_CANCELED',
    ].includes(axiosError.code ?? '');
  }

  /** El `rid` es el X-Request-ID de la VPS: con él se busca la petición en sus logs. */
  private buildSafeErrorMessage(error: unknown): string {
    const axiosError = error as AxiosError<ErrorBody> | null;
    const requestId: unknown = axiosError?.response?.headers?.['x-request-id'];

    return [
      axiosError?.response?.status
        ? `status=${axiosError.response.status}`
        : null,
      axiosError?.code ? `code=${axiosError.code}` : null,
      axiosError?.response?.data?.code
        ? `iot=${axiosError.response.data.code}`
        : null,
      typeof requestId === 'string' ? `rid=${requestId}` : null,
      axiosError?.response?.data?.message,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private errorCodeOf(error: unknown): AccessIotErrorCode | null {
    return (error as AxiosError<ErrorBody>)?.response?.data?.code ?? null;
  }

  private statusOf(error: unknown): number | null {
    return (error as AxiosError)?.response?.status ?? null;
  }

  private baseUrl(): string {
    const url = this.configService.get<string>('ACCESS_IOT_URL')?.trim() ?? '';

    if (!url) {
      throw new ServiceUnavailableException(
        'ACCESS_IOT_URL no está configurada',
      );
    }

    return url.replace(/\/+$/, '');
  }

  private token(): { clientId: string; clientSecret: string } {
    const raw =
      this.configService.get<string>('ACCESS_IOT_TOKEN')?.trim() ?? '';
    const [clientId, clientSecret] = raw.split(':');

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'ACCESS_IOT_TOKEN debe tener el formato <client-id>:<client-secret>',
      );
    }

    return { clientId, clientSecret };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
