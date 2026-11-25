import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';
import type { CleaningsRequest } from '../decorators/cleanings-client.decorator';

export const CLEANINGS_API_KEY_HEADER = 'x-api-key';

const READ_KEYS = 'CLEANINGS_API_KEYS';
const WRITE_KEYS = 'CLEANINGS_WRITE_API_KEYS';

const MIN_KEY_LENGTH = 32;
const WINDOW_MS = 60 * 1000;
const MAX_READS_PER_CLIENT = 60;
const MAX_WRITES_PER_CLIENT = 20;
const MAX_INVALID_PER_IP = 20;

type ApiClient = { name: string; digest: Buffer; canWrite: boolean };

/** Con `valid: false` ninguna sirve; se conservan para detectar repetidas. */
type KeyList = { clients: ApiClient[]; valid: boolean };

@Injectable()
export class CleaningsApiKeyGuard implements CanActivate {
  protected readonly writes: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<CleaningsRequest>();
    const response = http.getResponse<Response>();

    // Aquí y no con @Header: así también la llevan los errores (un 404 es cacheable).
    response.setHeader('Cache-Control', 'private, no-store');

    const clients = this.clients();

    if (!clients.some((client) => client.canWrite || !this.writes)) {
      throw new ServiceUnavailableException(
        this.writes
          ? 'La escritura de limpiezas no está configurada'
          : 'La API de limpiezas no está configurada',
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

    this.limitClient(response, client);

    if (this.writes && !client.canWrite) {
      throw new ForbiddenException('La clave no tiene permiso de escritura');
    }

    request.cleaningsClient = client.name;

    return true;
  }

  /** Una clave en ambas listas anula la de escritura, nunca la de lectura. */
  private clients(): ApiClient[] {
    const read = this.load(READ_KEYS, false);
    const write = this.load(WRITE_KEYS, true);
    const shared = write.clients.some(({ digest }) =>
      read.clients.some((client) => client.digest.equals(digest)),
    );

    return [
      ...(read.valid ? read.clients : []),
      ...(write.valid && !shared ? write.clients : []),
    ];
  }

  /** Si falta la variable o alguna entrada es inválida, se cierra entera. */
  private load(variable: string, canWrite: boolean): KeyList {
    const raw = this.configService.get<string>(variable)?.trim() ?? '';
    const clients: ApiClient[] = [];
    let valid = true;

    for (const entry of raw.split(',')) {
      const separator = entry.indexOf(':');
      const name = entry.slice(0, Math.max(separator, 0)).trim();
      const key = entry.slice(separator + 1).trim();

      if (!name || key.length < MIN_KEY_LENGTH) valid = false;

      clients.push({ name, digest: this.digest(key), canWrite });
    }

    return { clients, valid };
  }

  // Recorre todas las claves: el tiempo no revela cuál coincidió.
  private match(
    received: string | string[] | undefined,
    clients: ApiClient[],
  ): ApiClient | null {
    if (typeof received !== 'string' || !received.trim()) return null;

    const digest = this.digest(received.trim());
    let found: ApiClient | null = null;

    for (const client of clients) {
      const matches = timingSafeEqual(digest, client.digest);
      found = matches ? client : found;
    }

    return found;
  }

  // Contadores aparte: un cliente de lectura y otro de escritura pueden llamarse igual.
  private limitClient(response: Response, client: ApiClient): void {
    const { name, canWrite } = client;

    if (this.writes && canWrite) {
      this.limit(
        response,
        `cleanings-api:write:${name}`,
        MAX_WRITES_PER_CLIENT,
      );
    } else {
      const owner = canWrite ? 'writer' : 'client';
      this.limit(
        response,
        `cleanings-api:${owner}:${name}`,
        MAX_READS_PER_CLIENT,
      );
    }
  }

  private limit(response: Response, key: string, max: number): void {
    if (this.rateLimiter.hit(key, max, WINDOW_MS)) return;

    response.setHeader('Retry-After', '60');
    throw new HttpException(
      'Demasiadas peticiones: esperar un minuto antes de repetir',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
