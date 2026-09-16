import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestPortalData } from '../../access-control/guest-portal-data.service';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';
import { GuestPortalService } from '../guest-portal.service';

/** Cabecera propia, alternativa a `Authorization`. */
export const GUEST_TOKEN_HEADER = 'x-guest-token';

const HOUR_MS = 60 * 60 * 1000;

/** Canjes de enlace por IP y por hora. */
const MAX_REDEEMS_PER_IP = 120;

// Solo por cabecera: en la URL quedaría en el historial y en los logs de proxies.
const readToken = (request: Request): string => {
  const header =
    (request.headers[GUEST_TOKEN_HEADER] as string | undefined) ??
    request.headers.authorization ??
    '';

  return header.replace(/^Bearer\s+/i, '').trim();
};

/** Los datos resueltos quedan aquí para que el controlador puedan leerlos. */
export interface RequestWithGuest extends Request {
  guest?: GuestPortalData;
}

/**
 * Exige un enlace válido en los endpoints del huésped.
 *
 * Es el equivalente de `OwnerSessionGuard` para quien no tiene cuenta: el
 * huésped nunca inicia sesión, su única credencial es el enlace firmado. Por
 * eso, igual que allí, **ningún identificador de la ruta o del cuerpo sirve
 * como credencial**: la estancia a la que el huésped tiene derecho sale siempre
 * del token, y el controlador debe leerla de `request.guest`.
 */
@Injectable()
export class GuestTokenGuard implements CanActivate {
  constructor(
    private readonly portal: GuestPortalService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithGuest>();
    const token = readToken(request);

    if (!token) {
      throw new UnauthorizedException('Falta el enlace de acceso');
    }

    // El límite se comprueba antes de resolver, que es lo que consulta la base
    // y descifra un PIN. Ponerlo en el controlador no serviría: los guards
    // corren antes que el handler, así que el trabajo ya estaría hecho.
    //
    // No protege el token —uno inventado ni siquiera pasa la firma— sino el
    // coste de un cliente en bucle sobre un enlace legítimo.
    if (
      !this.rateLimiter.hit(
        this.bucketKey(request),
        MAX_REDEEMS_PER_IP,
        HOUR_MS,
      )
    ) {
      throw new HttpException(
        'Demasiadas peticiones. Espera unos minutos y vuelve a intentarlo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    request.guest = await this.portal.resolve(token);

    return true;
  }

  private bucketKey(request: Request): string {
    return `guest:ip:${request.ip ?? 'desconocida'}`;
  }
}
