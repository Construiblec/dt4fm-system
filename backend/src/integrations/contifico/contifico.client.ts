import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

@Injectable()
export class ContificoClient {
  private readonly logger = new Logger(ContificoClient.name);
  private readonly baseUrl = 'https://api.contifico.com/sistema/api/v1';
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('CONTIFICO_API_KEY') ?? '';
  }

  private get authHeaders() {
    return { Authorization: this.apiKey };
  }

  async get<T = unknown>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.logger.log(`[HTTP] GET ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.get<T>(url, {
          ...config,
          headers: { ...this.authHeaders, ...(config?.headers ?? {}) },
        }),
      );
      this.logger.log(`[HTTP] GET ${url} → ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`[HTTP] GET ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }

  async post<T = unknown>(path: string, body: unknown, config?: AxiosRequestConfig): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    this.logger.log(`[HTTP] POST ${url}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post<T>(url, body, {
          ...config,
          headers: { ...this.authHeaders, ...(config?.headers ?? {}) },
        }),
      );
      this.logger.log(`[HTTP] POST ${url} → ${response.status}`);
      return response.data;
    } catch (error) {
      this.logger.error(`[HTTP] POST ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }
}
