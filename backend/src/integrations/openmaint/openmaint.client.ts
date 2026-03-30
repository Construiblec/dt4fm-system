import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OpenmaintClient {
  private baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('OPENMAINT_URL') || '';
  }

  async get(path: string, sessionId?: string, config?: AxiosRequestConfig) {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HTTP] GET ${url}`);

    const headers = sessionId ? { 'Cmdbuild-authorization': sessionId } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          ...config,
          headers: {
            ...headers,
            ...(config?.headers ?? {}),
          },
        }),
      );

      console.log(`[HTTP] GET ${url} → ${response.status}`);

      return response.data;
    } catch (error) {
      console.error(`[HTTP] GET ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }

  async post(
    path: string,
    body: any,
    sessionId?: string,
    config?: AxiosRequestConfig,
  ) {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HTTP] POST ${url}`);

    const headers = sessionId ? { 'Cmdbuild-authorization': sessionId } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          ...config,
          headers: {
            ...headers,
            ...(config?.headers ?? {}),
          },
        }),
      );

      console.log(`[HTTP] POST ${url} → ${response.status}`);

      return response.data;
    } catch (error) {
      console.error(`[HTTP] POST ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }

  async put(
    path: string,
    body: any,
    sessionId?: string,
    config?: AxiosRequestConfig,
  ) {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HTTP] PUT ${url}`);

    const headers = sessionId ? { 'Cmdbuild-authorization': sessionId } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.put(url, body, {
          ...config,
          headers: {
            ...headers,
            ...(config?.headers ?? {}),
          },
        }),
      );

      console.log(`[HTTP] PUT ${url} → ${response.status}`);

      return response.data;
    } catch (error) {
      console.error(`[HTTP] PUT ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }
}
