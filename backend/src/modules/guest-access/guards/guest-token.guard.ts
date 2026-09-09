import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { GuestAccessService, GuestIdentity } from '../guest-access.service';
import { RateLimiterService } from '../../password-recovery/rate-limiter.service';

/** Cabecera propia, alternativa a `Authorization`. */
export const GUEST_TOKEN_HEADER = 'x-guest-token';

const HOUR_MS = 60 * 60 * 1000;

/** Canjes de enlace por IP y por hora. */
const MAX_REDEEMS_PER_IP = 120;

/**
 * El token puede llegar de tres formas, por orden de preferencia:
 *
 * 1. `Authorization: Bearer <token>` — la que debe usar el frontend en sus
 *    llamadas, una vez que leyó el token de la URL.
 * 2. `x-guest-token` — alternativa para clientes que no controlan la cabecera
 *    de autorización.
 * 3. `?token=` — solo para la primera carga, cuando el huésped abre el enlace
 *    del correo y el frontend todavía no tiene nada guardado.
 *
 * El tercero va último a propósito: un token en la URL queda en el historial
 * del navegador y en los logs de cualquier proxy intermedio, así que la idea es
 * que el frontend lo saque del query string cuanto antes y lo mande por
 * cabecera de ahí en adelante.
 */
const readToken = (request: Request): string => {
  const header =
    (request.headers[GUEST_TOKEN_HEADER] as string | undefined) ??
    request.headers.authorization ??
    '';

  const fromHeader = header.replace(/^Bearer\s+/i, '').trim();

  if (fromHeader) {
    return fromHeader;
  }

  const fromQuery = (request.query as Record<string, unknown>)?.token;

  return typeof fromQuery === 'string' ? fromQuery.trim() : '';
};

/** La identidad resuelta queda aquí para que el controlador pueda leerla. */
export interface RequestWithGuest extends Request {
  guest?: GuestIdentity;
}

/**
 * Exige un magiclink válido en los endpoints del huésped.
 *
 * Es el equivalente de `OwnerSessionGuard` para quien no tiene cuenta: el
 * huésped nunca inicia sesión, su única credencial es el enlace firmado. Por
 * eso, igual que allí, **ningún identificador de la ruta o del cuerpo sirve
 * como credencial**: la reserva a la que el huésped tiene derecho sale siempre
 * del token, y el controlador debe leerla de `request.guest`.
 */
@Injectable()
export class GuestTokenGuard implements CanActivate {
  constructor(
    private readonly guestAccess: GuestAccessService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithGuest>();
    const token = readToken(request);

    if (!token) {
      throw new UnauthorizedException('Falta el enlace de acceso');
    }

    // El límite se comprueba antes de resolver, que es lo que puede acabar
    // consultando a Hostaway. Ponerlo en el controlador no serviría: los guards
    // corren antes que el handler, así que la llamada ya se habría hecho.
    //
    // No protege el token —uno inventado ni siquiera pasa la firma— sino la
    // cuota de la API: frena que un cliente en bucle dispare una consulta por
    // petición cada vez que vence la caché de la reserva.
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

    request.guest = await this.guestAccess.resolve(token);

    return true;
  }

  private bucketKey(request: Request): string {
    return `guest:ip:${request.ip ?? 'desconocida'}`;
  }
}
