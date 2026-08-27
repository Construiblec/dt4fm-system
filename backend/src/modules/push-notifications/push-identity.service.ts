import {
  BadGatewayException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OpenmaintService,
  OpenmaintSession,
} from '../../integrations/openmaint/openmaint.service';

/**
 * Resuelve quién es el usuario a partir de su sesión de openMAINT.
 *
 * La sesión es la única fuente: el cliente no puede pedir las notificaciones de
 * otra persona ni suscribirse en su nombre.
 */
@Injectable()
export class PushIdentityService {
  constructor(private readonly openmaintService: OpenmaintService) {}

  async resolveSession(sessionId: string): Promise<OpenmaintSession> {
    let session: OpenmaintSession | null;

    try {
      session = await this.openmaintService.getSession(sessionId);
    } catch (error) {
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

    if (!session?.userId || !session.username) {
      throw new UnauthorizedException(
        'openMAINT no devolvió la identidad de la sesión',
      );
    }

    return session;
  }

  /** El `userId` con el que se guardan suscripciones e historial. */
  async resolveUserId(sessionId: string): Promise<string> {
    return String((await this.resolveSession(sessionId)).userId);
  }
}
