import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import {
  describeError,
  safePath,
} from '../../common/logging/describe-error.util';

@Injectable()
export class ContificoClient {
  private readonly logger = new Logger(ContificoClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('CONTIFICO_API_KEY') ?? '';
    this.baseUrl =
      this.configService.get<string>('CONTIFICO_BASE_URL') ??
      'https://api.contifico.com/sistema/api/v1';
  }

  private get authHeaders() {
    return { Authorization: this.apiKey };
  }

  /**
   * Una línea de `debug` si sale bien y una de `warn` si falla, sin la URL
   * completa ni el cuerpo de la respuesta (como en `OpenmaintClient`).
   */
  private async send<T>(
    method: string,
    path: string,
    request: () => Observable<AxiosResponse<T>>,
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(request());

      this.logger.debug(
        `${method} ${safePath(path)} → ${response.status} (${Date.now() - startedAt} ms)`,
      );

      return response.data;
    } catch (error) {
      const reason = isAxiosError(error)
        ? describeError(error)
        : `${method} ${safePath(path)} → ${describeError(error)}`;

      this.logger.warn(`${reason} (${Date.now() - startedAt} ms)`);
      throw error;
    }
  }

  async get<T = unknown>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.send('GET', path, () =>
      this.httpService.get<T>(`${this.baseUrl}${path}`, {
        ...config,
        headers: { ...this.authHeaders, ...(config?.headers ?? {}) },
      }),
    );
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.send('POST', path, () =>
      this.httpService.post<T>(`${this.baseUrl}${path}`, body, {
        ...config,
        headers: { ...this.authHeaders, ...(config?.headers ?? {}) },
      }),
    );
  }
}
