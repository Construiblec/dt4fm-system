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

export const IOT_SECRET_HEADER = 'x-iot-secret';

/**
 * Único control de acceso del webhook: la Pi no tiene sesión de openMAINT y el
 * backend no tiene guard global.
 */
@Injectable()
export class IotWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('IOT_WEBHOOK_SECRET') ?? '';

    // Sin secreto configurado el endpoint se apaga; nunca queda abierto.
    if (!expected) {
      throw new ServiceUnavailableException(
        'El webhook de alarmas IoT no está configurado',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.headers[IOT_SECRET_HEADER];

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
