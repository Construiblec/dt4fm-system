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

  /**
   * Sube un archivo como multipart/form-data.
   * Axios v1.x detecta automáticamente FormData y establece el Content-Type con boundary.
   */
  async postFormData(
    path: string,
    formData: globalThis.FormData,
    sessionId?: string,
  ) {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HTTP] POST (multipart) ${url}`);

    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['Cmdbuild-authorization'] = sessionId;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, formData, { headers }),
      );

      console.log(`[HTTP] POST (multipart) ${url} → ${response.status}`);

      return response.data;
    } catch (error) {
      console.error(`[HTTP] POST (multipart) ${url} → ERROR`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });
      throw error;
    }
  }

  /**
   * Descarga el binario de un archivo desde OpenMAINT y lo retorna como Buffer.
   * Preserva el Content-Type y el nombre de archivo del response.
   */
  async getBuffer(
    path: string,
    sessionId?: string,
  ): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const url = `${this.baseUrl}${path}`;
    console.log(`[HTTP] GET (buffer) ${url}`);

    const headers: Record<string, string> = {};
    if (sessionId) {
      headers['Cmdbuild-authorization'] = sessionId;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers,
          responseType: 'arraybuffer',
        }),
      );

      const contentType =
        (response.headers['content-type'] as string) ?? 'application/octet-stream';

      // Extrae el nombre del header Content-Disposition si existe
      const disposition = (response.headers['content-disposition'] as string) ?? '';
      const fileNameMatch = disposition.match(/filename[^;=\n]*=(['"]?)([^'"\n;]*?)\1/);
      const fileName = fileNameMatch?.[2]?.trim() ?? 'attachment';

      console.log(`[HTTP] GET (buffer) ${url} → ${response.status} ${contentType}`);

      return {
        data: Buffer.from(response.data as ArrayBuffer),
        contentType,
        fileName,
      };
    } catch (error) {
      console.error(`[HTTP] GET (buffer) ${url} → ERROR`, {
        status: error?.response?.status,
        message: error?.message,
      });
      throw error;
    }
  }

  async delete(path: string, sessionId?: string) {
    const url = `${this.baseUrl}${path}`;

    console.log(`[HTTP] DELETE ${url}`);

    const headers = sessionId ? { 'Cmdbuild-authorization': sessionId } : {};

    try {
      const response = await firstValueFrom(
        this.httpService.delete(url, { headers }),
      );

      console.log(`[HTTP] DELETE ${url} → ${response.status}`);

      return response.data;
    } catch (error) {
      console.error(`[HTTP] DELETE ${url} → ERROR`, {
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
