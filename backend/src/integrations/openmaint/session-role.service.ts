import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenmaintService } from './openmaint.service';

/**
 * Rol activo del llamante, resuelto desde su sesión de openMAINT — nunca
 * desde una cabecera que controla el cliente.
 *
 * Antes, `cleaning-tasks` y `maintenance-supervision` leían el rol de
 * `x-role`, que el frontend arma leyendo `localStorage`: bastaba con cambiar
 * ese valor en las herramientas de desarrollador del navegador para pasar el
 * gate con un rol que la sesión real no tiene (BP-003). Mismo defecto que
 * BP-001 (confiar en un dato que declara quien llama), en una cabecera en vez
 * de en la URL.
 *
 * A diferencia de `OwnersIdentityService`, esto NO se cachea: resolver el rol
 * cuesta una sola llamada (`getSession`, la misma que ya hace falta para
 * comprobar que la sesión existe), y el rol puede cambiar en cualquier
 * momento vía `PUT /auth/role` — cachearlo dejaría un cambio de rol sin
 * efecto hasta que expirara la entrada.
 */
@Injectable()
export class SessionRoleService {
  constructor(private readonly openmaintService: OpenmaintService) {}

  /**
   * Lanza si falta la sesión o no es válida. Devuelve `null` solo si
   * openMAINT confirma la sesión pero no trae rol activo, algo que el tipo
   * `OpenmaintSession` no descarta aunque no debería ocurrir en la práctica.
   */
  async resolveRole(sessionId: string): Promise<string | null> {
    if (!sessionId?.trim()) {
      throw new UnauthorizedException('Falta la sesión de openMAINT');
    }

    try {
      const session = await this.openmaintService.getSession(sessionId);

      if (!session) {
        throw new UnauthorizedException('Sesión de openMAINT no válida');
      }

      return session.role ?? null;
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
}
