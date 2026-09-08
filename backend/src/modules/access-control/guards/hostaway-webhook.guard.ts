import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

export const HOSTAWAY_SECRET_HEADER = 'x-hostaway-secret';

/**
 * Mismo patrón que `IotWebhookGuard`, y por una razón más fuerte: este webhook
 * emite y revoca credenciales de puerta. Sin secreto, cualquiera podría inventar
 * una reserva para que se emitiera un PIN, o mandar una cancelación con un id
 * conocido para revocar uno legítimo.
 */
@Injectable()
export class HostawayWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected =
      this.configService.get<string>('HOSTAWAY_WEBHOOK_SECRET') ?? '';

    // Sin secreto configurado el endpoint se apaga; nunca queda abierto.
    if (!expected) {
      throw new ServiceUnavailableException(
        'El webhook de reservas no está configurado',
      );
    }

    const received = context.switchToHttp().getRequest<Request>().headers[
      HOSTAWAY_SECRET_HEADER
    ];

    if (typeof received !== 'string' || !this.matches(received, expected)) {
      throw new UnauthorizedException('Secreto de webhook inválido');
    }

    return true;
  }

  private matches(received: string, expected: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);

    // timingSafeEqual exige la misma longitud, así que se comprueba antes.
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
