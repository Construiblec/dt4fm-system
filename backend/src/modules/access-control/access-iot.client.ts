import {
  BadGatewayException,
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
  at?: string;
}

/** Un código tipado o un 4xx es un no seguro; un 5xx sin código o un corte a medias, incierto. */
export const classifyCommandError = (error: unknown): DoorCommandResult => {
  const axiosError = error as AxiosError<ErrorBody> | undefined;
  const code = axiosError?.response?.data?.code;

  if (code) return { outcome: 'failed', errorCode: code };

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
    const response = await this.request<AccessIotBuilding[]>(
      'GET /v1/buildings',
      { method: 'GET', url: '/v1/buildings' },
    );

    return response.data ?? [];
  }

  async listDevices(): Promise<AccessIotDevice[]> {
    const response = await this.request<AccessIotDevice[]>('GET /v1/devices', {
      method: 'GET',
      url: '/v1/devices',
    });

    return response.data ?? [];
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
    try {
      const response = await this.request<CredentialWriteResult>(
        `GET /v1/credentials/${credentialId}`,
        {
          method: 'GET',
          url: `/v1/credentials/${encodeURIComponent(credentialId)}`,
        },
      );

      return response.data ?? null;
    } catch (error) {
      if (this.statusOf(error) === 404) {
        return null;
      }

      throw error;
    }
  }

  async getHealth(): Promise<AccessIotHealth> {
    const response = await this.request<AccessIotHealth>('GET /v1/health', {
      method: 'GET',
      url: '/v1/health',
    });

    return response.data ?? { buildings: [] };
  }

  async getDeviceInventory(
    deviceId: string,
    cursor?: string,
  ): Promise<InventoryPage> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await this.request<InventoryPage>(
      `GET /v1/devices/${deviceId}/inventory`,
      {
        method: 'GET',
        url: `/v1/devices/${encodeURIComponent(deviceId)}/inventory${query}`,
      },
    );

    return response.data ?? { users: [], nextCursor: null };
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

      return { outcome: state === done ? done : 'uncertain', at };
    } catch (error) {
      const result = classifyCommandError(error);
      const detail =
        this.buildSafeErrorMessage(error as Error) || (error as Error).message;

      this.logger.warn(`${operation} -> ${result.outcome} (${detail})`);

      return result;
    }
  }

  /**
   * Una escritura devuelve su desenlace en el cuerpo. Solo `pin_conflict` y
   * `device_full` llegan como resultado; lo demás sube como excepción, porque
   * es configuración o red y no algo que el flujo de negocio pueda resolver.
   */
  private async writeCredential(
    operation: string,
    config: AxiosRequestConfig,
  ): Promise<CredentialWriteResult> {
    try {
      const response = await this.request<CredentialWriteResult>(
        operation,
        config,
      );

      return response.data;
    } catch (error) {
      const code = this.errorCodeOf(error);

      if (code && BUSINESS_ERROR_CODES.includes(code)) {
        this.logger.warn(`${operation} devolvió ${code}`);

        return {
          credentialId: '',
          state: 'failed',
          devices: [],
          errorCode: code,
        };
      }

      throw error;
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
    // Se validan antes del bucle: una configuración ausente no se reintenta.
    this.baseUrl();
    this.token();

    let lastError: AxiosError | Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      try {
        return await this.send<T>(config, this.requestTimeoutMs);
      } catch (error) {
        lastError = error as AxiosError | Error;
        const safeMessage = this.buildSafeErrorMessage(lastError);
        const shouldRetry =
          attempt <= this.maxRetries && this.isRetryableError(lastError);

        this.logger.warn(
          `${operation} falló en intento ${attempt}/${this.maxRetries + 1}` +
            (safeMessage ? ` -> ${safeMessage}` : ''),
        );

        if (!shouldRetry) break;

        await this.delay(attempt * 1_500);
      }
    }

    throw this.translate(lastError);
  }

  private translate(error: AxiosError | Error | null): Error {
    const safeMessage = this.buildSafeErrorMessage(error);
    const code = this.errorCodeOf(error);
    const status = this.statusOf(error);

    if (code === 'unauthorized' || status === 401 || status === 403) {
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

  private isRetryableError(error: AxiosError | Error): boolean {
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

  private buildSafeErrorMessage(error: AxiosError | Error | null): string {
    const axiosError = error as AxiosError<ErrorBody>;

    return [
      axiosError?.response?.status
        ? `status=${axiosError.response.status}`
        : null,
      axiosError?.code ? `code=${axiosError.code}` : null,
      axiosError?.response?.data?.code
        ? `iot=${axiosError.response.data.code}`
        : null,
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
