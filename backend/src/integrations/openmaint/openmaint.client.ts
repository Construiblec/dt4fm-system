import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import { firstValueFrom, Observable } from 'rxjs';
import {
  describeError,
  safePath,
} from '../../common/logging/describe-error.util';

@Injectable()
export class OpenmaintClient {
  private readonly logger = new Logger(OpenmaintClient.name);
  private baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('OPENMAINT_URL') || '';
  }

  private sessionHeaders(sessionId?: string): Record<string, string> {
    return sessionId ? { 'Cmdbuild-authorization': sessionId } : {};
  }

  /**
   * Toda petición a openMAINT pasa por aquí: una línea de `debug` si sale bien
   * (oculta con el nivel por defecto) y una de `warn` si falla.
   *
   * Antes cada llamada escribía dos líneas con la URL entera —el filtro JSON
   * codificado y la IP del VPS, ~424 caracteres— y cada fallo volcaba el cuerpo
   * completo de la respuesta. `safePath` además tapa el id de `/sessions/{id}`,
   * que es la credencial misma.
   */
  private async send<T = any>(
    method: string,
    path: string,
    request: () => Observable<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    const startedAt = Date.now();

    try {
      const response = await firstValueFrom(request());

      this.logger.debug(
        `${method} ${safePath(path)} → ${response.status} (${Date.now() - startedAt} ms)`,
      );

      return response;
    } catch (error) {
      const reason = isAxiosError(error)
        ? describeError(error)
        : `${method} ${safePath(path)} → ${describeError(error)}`;

      this.logger.warn(`${reason} (${Date.now() - startedAt} ms)`);
      throw error;
    }
  }

  async get(path: string, sessionId?: string, config?: AxiosRequestConfig) {
    const response = await this.send('GET', path, () =>
      this.httpService.get(`${this.baseUrl}${path}`, {
        ...config,
        headers: {
          ...this.sessionHeaders(sessionId),
          ...(config?.headers ?? {}),
        },
      }),
    );

    return response.data;
  }

  async post(
    path: string,
    body: any,
    sessionId?: string,
    config?: AxiosRequestConfig,
  ) {
    const response = await this.send('POST', path, () =>
      this.httpService.post(`${this.baseUrl}${path}`, body, {
        ...config,
        headers: {
          ...this.sessionHeaders(sessionId),
          ...(config?.headers ?? {}),
        },
      }),
    );

    return response.data;
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
    const response = await this.send('POST', path, () =>
      this.httpService.post(`${this.baseUrl}${path}`, formData, {
        headers: this.sessionHeaders(sessionId),
      }),
    );

    return response.data;
  }

  /**
   * Descarga el binario de un archivo desde OpenMAINT y lo retorna como Buffer.
   * Preserva el Content-Type y el nombre de archivo del response.
   */
  async getBuffer(
    path: string,
    sessionId?: string,
  ): Promise<{ data: Buffer; contentType: string; fileName: string }> {
    const response = await this.send<ArrayBuffer>('GET', path, () =>
      this.httpService.get<ArrayBuffer>(`${this.baseUrl}${path}`, {
        headers: this.sessionHeaders(sessionId),
        responseType: 'arraybuffer',
      }),
    );

    const contentType =
      (response.headers['content-type'] as string) ??
      'application/octet-stream';

    // Extrae el nombre del header Content-Disposition si existe
    const disposition =
      (response.headers['content-disposition'] as string) ?? '';
    const fileNameMatch = disposition.match(
      /filename[^;=\n]*=(['"]?)([^'"\n;]*?)\1/,
    );
    const fileName = fileNameMatch?.[2]?.trim() ?? 'attachment';

    return {
      data: Buffer.from(response.data),
      contentType,
      fileName,
    };
  }

  async delete(path: string, sessionId?: string) {
    const response = await this.send('DELETE', path, () =>
      this.httpService.delete(`${this.baseUrl}${path}`, {
        headers: this.sessionHeaders(sessionId),
      }),
    );

    return response.data;
  }

  async put(
    path: string,
    body: any,
    sessionId?: string,
    config?: AxiosRequestConfig,
  ) {
    const response = await this.send('PUT', path, () =>
      this.httpService.put(`${this.baseUrl}${path}`, body, {
        ...config,
        headers: {
          ...this.sessionHeaders(sessionId),
          ...(config?.headers ?? {}),
        },
      }),
    );

    return response.data;
  }
}
