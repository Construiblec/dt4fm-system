import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/**
 * Basic Auth porque es lo único que sabe enviar el unified webhook de Hostaway
 * (`login`/`password`). Este webhook emite y revoca PINes: sin credenciales, se cierra.
 */
@Injectable()
export class HostawayWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const user = this.config('HOSTAWAY_WEBHOOK_USER');
    const secret = this.config('HOSTAWAY_WEBHOOK_SECRET');

    if (!user || !secret) {
      throw new ServiceUnavailableException(
        'El webhook de reservas no está configurado',
      );
    }

    const received = this.basicCredentials(
      context.switchToHttp().getRequest<Request>().headers.authorization,
    );

    if (received === null || !this.matches(received, `${user}:${secret}`)) {
      throw new UnauthorizedException('Credenciales de webhook inválidas');
    }

    return true;
  }

  private config(name: string): string {
    return this.configService.get<string>(name)?.trim() ?? '';
  }

  private basicCredentials(header?: string): string | null {
    const match = /^Basic\s+([A-Za-z0-9+/]+=*)\s*$/i.exec(header ?? '');

    if (!match) return null;

    const decoded = Buffer.from(match[1], 'base64').toString('utf8');

    return decoded.includes(':') ? decoded : null;
  }

  // Digests de longitud fija: la comparación no filtra la longitud del secreto.
  private matches(received: string, expected: string): boolean {
    return timingSafeEqual(this.digest(received), this.digest(expected));
  }

  private digest(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }
}
