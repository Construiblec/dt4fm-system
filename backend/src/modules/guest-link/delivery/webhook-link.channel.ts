import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { createHmac } from 'crypto';
import { firstValueFrom } from 'rxjs';
import {
  GuestLinkChannel,
  GuestLinkPayload,
  GuestLinkSendResult,
} from './guest-link-channel.interface';

const REQUEST_TIMEOUT_MS = 10_000;

/** Cabecera con la firma, para que el receptor pueda verificar que somos nosotros. */
export const SIGNATURE_HEADER = 'X-DT4FM-Signature';

/**
 * Entrega el enlace haciendo `POST` con el payload a una URL configurable.
 *
 * Es el canal más neutral posible: no sabe si al otro lado hay una prueba
 * (webhook.site), un integrador (n8n) o un proveedor de mensajería. Lo que
 * sí garantiza es que el cuerpo se pueda autenticar: si hay secreto, va
 * firmado con HMAC-SHA256 en `X-DT4FM-Signature`, con el mismo formato
 * `sha256=<hex>` que usan GitHub y compañía.
 */
@Injectable()
export class WebhookLinkChannel implements GuestLinkChannel {
  readonly name = 'webhook';

  private readonly logger = new Logger(WebhookLinkChannel.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async send(payload: GuestLinkPayload): Promise<GuestLinkSendResult> {
    const url = this.configService
      .get<string>('GUEST_LINK_WEBHOOK_URL')
      ?.trim();

    if (!url) {
      return {
        success: false,
        target: '',
        error: 'GUEST_LINK_WEBHOOK_URL no está configurada',
      };
    }

    const body = JSON.stringify(payload);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
            ...this.signatureHeader(body),
          },
        }),
      );

      return { success: true, target: url, httpStatus: response.status };
    } catch (error) {
      const axiosError = error as AxiosError;
      const httpStatus = axiosError.response?.status;
      const detail = [
        httpStatus ? `status=${httpStatus}` : null,
        axiosError.code ? `code=${axiosError.code}` : null,
        axiosError.message,
      ]
        .filter(Boolean)
        .join(' | ');

      this.logger.warn(`Entrega por webhook fallida -> ${detail}`);

      return { success: false, target: url, httpStatus, error: detail };
    }
  }

  private signatureHeader(body: string): Record<string, string> {
    const secret = this.configService
      .get<string>('GUEST_LINK_WEBHOOK_SECRET')
      ?.trim();

    if (!secret) {
      return {};
    }

    const digest = createHmac('sha256', secret).update(body).digest('hex');

    return { [SIGNATURE_HEADER]: `sha256=${digest}` };
  }
}
