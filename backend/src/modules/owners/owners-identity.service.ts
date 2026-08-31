import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';

/** Identidad del residente, resuelta desde su sesión y no desde la URL. */
export type OwnerIdentity = {
  /** `_id` de la cuenta en openMAINT. */
  userId: number;
  username: string;
  /** Ficha `Tenant`. `null` si el usuario no tiene una localizable. */
  tenantId: number | null;
};

/** Los grupos cuyos miembros son residentes. */
const OWNER_ROLE = 'Propietarios';

/**
 * Resolver la ficha `Tenant` cuesta dos llamadas a openMAINT (sesión de
 * servicio + búsqueda por descripción), y el dashboard de un residente encadena
 * varias peticiones seguidas. La caché evita repetirlo en cada una.
 *
 * Se cachea por `sessionId`: cambiar de rol no cambia de persona, así que el
 * `tenantId` sigue siendo válido aunque openMAINT recalcule los privilegios
 * sobre la misma sesión.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Quién es el que llama, según su sesión de openMAINT.
 *
 * Existe porque los endpoints de `owners` tomaban la identidad de un número en
 * la URL (`/owners/300/payments`) sin pedir ninguna cabecera de sesión: bastaba
 * con recorrer identificadores para leer el estado de cuenta de cualquier
 * residente. La sesión pasa a ser la única fuente.
 *
 * Mismo criterio que `PushIdentityService`, que ya lo aplicaba en su módulo.
 */
@Injectable()
export class OwnersIdentityService {
  private readonly logger = new Logger(OwnersIdentityService.name);
  private readonly cache = new Map<
    string,
    { identity: OwnerIdentity; cachedAt: number }
  >();

  constructor(
    private readonly openmaintService: OpenmaintService,
    private readonly serviceSession: OpenmaintServiceSession,
  ) {}

  async resolve(sessionId: string): Promise<OwnerIdentity> {
    if (!sessionId?.trim()) {
      throw new UnauthorizedException('Falta la sesión de openMAINT');
    }

    const cached = this.cache.get(sessionId);

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.identity;
    }

    const session = await this.readSession(sessionId);

    const isOwner = (session.availableRoles ?? []).includes(OWNER_ROLE);
    const description = session.userDescription ?? null;

    // Solo los residentes tienen ficha `Tenant`, y buscarla cuesta una sesión
    // de servicio extra: no se paga ese viaje para el resto del equipo.
    const tenantId =
      isOwner && description ? await this.findTenant(description) : null;

    const identity: OwnerIdentity = {
      userId: session.userId,
      username: session.username,
      tenantId,
    };

    this.cache.set(sessionId, { identity, cachedAt: Date.now() });

    return identity;
  }

  /** Descarta la entrada cacheada; útil al cerrar sesión o cambiar de rol. */
  forget(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  private async readSession(sessionId: string) {
    try {
      const session = await this.openmaintService.getSession(sessionId);

      if (!session?.userId || !session.username) {
        throw new UnauthorizedException(
          'openMAINT no devolvió la identidad de la sesión',
        );
      }

      return session;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const status = (error as { response?: { status?: number } })?.response
        ?.status;

      // openMAINT responde 400 a una sesión inexistente, no 401.
      if (status === 400 || status === 401 || status === 403) {
        throw new UnauthorizedException('Sesión de openMAINT no válida');
      }

      throw new BadGatewayException(
        `openMAINT no respondió al validar la sesión: ${(error as Error)?.message}`,
      );
    }
  }

  private async findTenant(description: string): Promise<number | null> {
    try {
      const serviceSessionId = await this.serviceSession.get();

      return await this.openmaintService.findTenantByDescription(
        description,
        serviceSessionId,
      );
    } catch (error) {
      // Un residente sin ficha localizable puede seguir entrando; lo que no
      // podrá es acceder a los endpoints acotados por `tenantId`.
      this.logger.warn(
        `No se pudo resolver el Tenant de "${description}": ${(error as Error)?.message}`,
      );

      return null;
    }
  }
}
