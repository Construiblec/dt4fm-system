import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  OwnerIdentity,
  OwnersIdentityService,
} from '../owners-identity.service';

/** La sesión viaja en `Authorization` sin esquema, o en `x-session-token`. */
const readSessionId = (request: Request): string =>
  (
    (request.headers['x-session-token'] as string | undefined) ??
    request.headers.authorization ??
    ''
  )
    .replace(/^Bearer\s+/i, '')
    .trim();

/** La identidad resuelta queda aquí para que el controlador pueda leerla. */
export interface RequestWithOwner extends Request {
  owner?: OwnerIdentity;
}

/**
 * Exige sesión en los endpoints de residentes y comprueba que el identificador
 * de la ruta sea el suyo.
 *
 * Antes de este guard, `/owners/:tenantId/payments` y sus hermanos no pedían
 * ninguna cabecera: la identidad salía del número de la URL. Como los
 * identificadores son secuenciales, recorrerlos devolvía el estado de cuenta de
 * todo el condominio sin necesidad de iniciar sesión.
 *
 * El parámetro de la ruta se conserva para no romper las URLs existentes, pero
 * deja de ser una credencial: ahora tiene que coincidir con lo que diga la
 * sesión. Cuando el frontend migre a rutas tipo `/owners/me/...` este guard
 * puede dejar de compararlo.
 */
@Injectable()
export class OwnerSessionGuard implements CanActivate {
  constructor(private readonly identity: OwnersIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOwner>();
    const owner = await this.identity.resolve(readSessionId(request));

    request.owner = owner;

    const requestedTenantId = this.numericParam(request, 'tenantId');
    const requestedUserId = this.numericParam(request, 'userId');

    if (requestedTenantId !== null) {
      if (owner.tenantId === null) {
        // Cuenta sin ficha `Tenant`: no es residente, o no se pudo localizar.
        // En ninguno de los dos casos puede leer datos acotados por tenant.
        throw new ForbiddenException(
          'La cuenta no tiene una ficha de propietario asociada',
        );
      }

      if (owner.tenantId !== requestedTenantId) {
        throw new ForbiddenException(
          'No puedes consultar los datos de otro propietario',
        );
      }
    }

    if (requestedUserId !== null && owner.userId !== requestedUserId) {
      throw new ForbiddenException(
        'No puedes consultar los datos de otro usuario',
      );
    }

    return true;
  }

  /**
   * `null` cuando la ruta no lleva ese parámetro. Un valor no numérico se
   * rechaza aquí en vez de dejarlo pasar: el guard corre antes que el
   * `ParseIntPipe` del controlador.
   */
  private numericParam(request: Request, name: string): number | null {
    const raw = (request.params as Record<string, string | undefined>)?.[name];

    if (raw === undefined) {
      return null;
    }

    const value = Number(raw);

    if (!Number.isInteger(value) || value <= 0) {
      throw new UnauthorizedException(`El parámetro ${name} no es válido`);
    }

    return value;
  }
}
