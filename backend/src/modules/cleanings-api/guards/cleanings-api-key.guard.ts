import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';

export const CLEANINGS_API_KEY_HEADER = 'x-api-key';

const MIN_KEY_LENGTH = 32;
const WINDOW_MS = 60 * 1000;
const MAX_PER_CLIENT = 60;
const MAX_INVALID_PER_IP = 20;

type ApiClient = { name: string; digest: Buffer };

@Injectable()
export class CleaningsApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Aquí y no con @Header: así también la llevan los errores (un 404 es cacheable).
    response.setHeader('Cache-Control', 'private, no-store');

    const clients = this.clients();

    if (!clients) {
      throw new ServiceUnavailableException(
        'La API de limpiezas no está configurada',
      );
    }

    const client = this.match(
      request.headers[CLEANINGS_API_KEY_HEADER],
      clients,
    );

    if (client === null) {
      this.limit(
        response,
        `cleanings-api:ip:${request.ip ?? 'desconocida'}`,
        MAX_INVALID_PER_IP,
      );
      throw new UnauthorizedException('Clave de API ausente o inválida');
    }

    this.limit(response, `cleanings-api:client:${client}`, MAX_PER_CLIENT);

    return true;
  }

  /** `null` si falta la variable o alguna entrada es inválida: se cierra entera. */
  private clients(): ApiClient[] | null {
    const raw =
      this.configService.get<string>('CLEANINGS_API_KEYS')?.trim() ?? '';

    if (!raw) return null;

    const clients: ApiClient[] = [];

    for (const entry of raw.split(',')) {
      const separator = entry.indexOf(':');
      const name = entry.slice(0, Math.max(separator, 0)).trim();
      const key = entry.slice(separator + 1).trim();

      if (!name || key.length < MIN_KEY_LENGTH) return null;

      clients.push({ name, digest: this.digest(key) });
    }

    return clients;
  }

  // Recorre todas las claves: el tiempo no revela cuál coincidió.
  private match(
    received: string | string[] | undefined,
    clients: ApiClient[],
  ): string | null {
    if (typeof received !== 'string' || !received.trim()) return null;

    const digest = this.digest(received.trim());
    let found: string | null = null;

    for (const client of clients) {
      const matches = timingSafeEqual(digest, client.digest);
      found = matches ? client.name : found;
    }

    return found;
  }

  private limit(response: Response, key: string, max: number): void {
    if (this.rateLimiter.hit(key, max, WINDOW_MS)) return;

    response.setHeader('Retry-After', '60');
    throw new HttpException(
      'Demasiadas peticiones. Espera un minuto y vuelve a intentarlo.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
