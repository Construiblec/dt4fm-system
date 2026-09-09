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

export const GUEST_ISSUER_SECRET_HEADER = 'x-guest-link-secret';

/**
 * Protege la emisión de magiclinks.
 *
 * Emitir es una capacidad fuerte: quien puede pedir un enlace para un número de
 * reserva cualquiera puede entrar al dashboard de cualquier huésped. Como el
 * llamador será un proceso interno —el envío de correos, y hoy también las
 * pruebas manuales— y no una persona con sesión de openMAINT, se resuelve con
 * un secreto compartido, igual que el webhook de alarmas IoT.
 *
 * Usa su propio secreto y no el de IoT a propósito: son capacidades distintas y
 * filtrar una no debe entregar la otra.
 */
@Injectable()
export class GuestLinkIssuerGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected =
      this.configService.get<string>('GUEST_LINK_ISSUER_SECRET')?.trim() ?? '';

    // Sin secreto configurado el endpoint se apaga; nunca queda abierto.
    if (!expected) {
      throw new ServiceUnavailableException(
        'La emisión de enlaces de huésped no está configurada',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.headers[GUEST_ISSUER_SECRET_HEADER];

    if (typeof received !== 'string' || !this.matches(received, expected)) {
      throw new UnauthorizedException('Secreto de emisión inválido');
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
