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
import type { IntegrationsRequest } from '../decorators/integrations-client.decorator';
import { readKeyList } from '../utils/read-key-list.util';

export const INTEGRATIONS_API_KEY_HEADER = 'x-api-key';

export const READ_KEYS = 'INTEGRATIONS_READ_API_KEYS';
export const LEGACY_READ_KEYS = 'CLEANINGS_API_KEYS';
export const WRITE_KEYS = 'INTEGRATIONS_WRITE_API_KEYS';
export const LEGACY_WRITE_KEYS = 'CLEANINGS_WRITE_API_KEYS';

const MIN_KEY_LENGTH = 32;
const WINDOW_MS = 60 * 1000;
const MAX_READS_PER_CLIENT = 60;
const MAX_WRITES_PER_CLIENT = 20;
const MAX_INVALID_PER_IP = 20;

export type ApiFamily = 'cleanings' | 'maintenance';

const NOT_CONFIGURED: Record<ApiFamily, { read: string; write: string }> = {
  cleanings: {
    read: 'La API de limpiezas no está configurada',
    write: 'La escritura de limpiezas no está configurada',
  },
  maintenance: {
    read: 'La API de mantenimiento no está configurada',
    write: 'La escritura de mantenimiento no está configurada',
  },
};

type ApiClient = { name: string; digest: Buffer; canWrite: boolean };

/** Con `valid: false` ninguna sirve; se conservan para detectar repetidas. */
type KeyList = { clients: ApiClient[]; valid: boolean };

/** Las mismas claves valen para todas las familias; cambian cupos y mensajes. */
@Injectable()
export abstract class IntegrationsApiKeyGuard implements CanActivate {
  protected abstract readonly family: ApiFamily;
  protected abstract readonly writes: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<IntegrationsRequest>();
    const response = http.getResponse<Response>();

    // Aquí y no con @Header: así también la llevan los errores (un 404 es cacheable).
    response.setHeader('Cache-Control', 'private, no-store');

    const clients = this.clients();

    if (!clients.some((client) => client.canWrite || !this.writes)) {
      const messages = NOT_CONFIGURED[this.family];
      throw new ServiceUnavailableException(
        this.writes ? messages.write : messages.read,
      );
    }

    const client = this.match(
      request.headers[INTEGRATIONS_API_KEY_HEADER],
      clients,
    );

    if (client === null) {
      // Contador común: probar claves en una familia gasta el cupo de la otra.
      this.limit(
        response,
        `integrations-api:ip:${request.ip ?? 'desconocida'}`,
        MAX_INVALID_PER_IP,
      );
      throw new UnauthorizedException('Clave de API ausente o inválida');
    }

    this.limitClient(response, client);

    if (this.writes && !client.canWrite) {
      throw new ForbiddenException('La clave no tiene permiso de escritura');
    }

    request.integrationsClient = client.name;

    return true;
  }

  /** Una clave en ambas listas anula la de escritura, nunca la de lectura. */
  private clients(): ApiClient[] {
    const read = this.load(READ_KEYS, LEGACY_READ_KEYS, false);
    const write = this.load(WRITE_KEYS, LEGACY_WRITE_KEYS, true);
    const shared = write.clients.some(({ digest }) =>
      read.clients.some((client) => client.digest.equals(digest)),
    );

    return [
      ...(read.valid ? read.clients : []),
      ...(write.valid && !shared ? write.clients : []),
    ];
  }

  /** Si falta la variable o alguna entrada es inválida, se cierra entera. */
  private load(variable: string, legacy: string, canWrite: boolean): KeyList {
    const raw = readKeyList(this.configService, variable, legacy);
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
    const prefix = `${this.family}-api`;

    if (this.writes && canWrite) {
      this.limit(response, `${prefix}:write:${name}`, MAX_WRITES_PER_CLIENT);
    } else {
      const owner = canWrite ? 'writer' : 'client';
      this.limit(response, `${prefix}:${owner}:${name}`, MAX_READS_PER_CLIENT);
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
