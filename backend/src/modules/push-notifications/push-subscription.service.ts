import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenmaintService,
  OpenmaintSession,
} from '../../integrations/openmaint/openmaint.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushSubscriptionRepository } from './push-subscription.repository';

@Injectable()
export class PushSubscriptionService {
  private readonly logger = new Logger(PushSubscriptionService.name);

  constructor(
    private readonly repository: PushSubscriptionRepository,
    private readonly openmaintService: OpenmaintService,
    private readonly configService: ConfigService,
  ) {}

  getVapidPublicKey(): string {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  /**
   * Da de alta la suscripción resolviendo la identidad contra openMAINT. La
   * sesión es la única fuente: de ella salen el usuario y el rol, así que el
   * cliente no puede suscribirse como otra persona ni inventarse un rol.
   */
  async subscribe(
    sessionId: string,
    claimedRole: string | undefined,
    dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    const session = await this.fetchSession(sessionId);
    const role = this.resolveRole(session, claimedRole);

    const [employeeId, cleaningEmployeeId] = await Promise.all([
      this.openmaintService.resolveEmployeeId(session.userId, sessionId),
      this.openmaintService.resolveCleaningEmployeeId(
        session.username,
        sessionId,
      ),
    ]);

    // Sin ficha de empleado solo llegan las notificaciones por rol. Se avisa
    // porque el síntoma (no recibir nada al ser asignado) no tiene otra pista:
    // suele ser que al Employee de openMAINT le falta el atributo LoginUser.
    if (employeeId === null && cleaningEmployeeId === null) {
      this.logger.warn(
        `El usuario ${session.username} (id ${session.userId}) no tiene ` +
          'Employee asociado: no recibirá avisos de tareas asignadas, solo ' +
          'los de su rol.',
      );
    }

    await this.repository.saveSubscription({
      userId: String(session.userId),
      username: session.username,
      role,
      employeeId,
      cleaningEmployeeId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    });

    this.logger.log(
      `Suscripción push registrada: ${session.username} rol=${role} ` +
        `employeeId=${employeeId ?? '-'} ` +
        `cleaningEmployeeId=${cleaningEmployeeId ?? '-'}`,
    );
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repository.deleteByEndpoint(endpoint);
  }

  private async fetchSession(sessionId: string): Promise<OpenmaintSession> {
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

  /**
   * Acepta el rol que declara el cliente solo si es uno de los que el usuario
   * puede asumir de verdad; si no, se queda con el rol activo de la sesión.
   */
  private resolveRole(
    session: OpenmaintSession,
    claimedRole?: string,
  ): string {
    const available = session.availableRoles ?? [];

    return claimedRole && available.includes(claimedRole)
      ? claimedRole
      : session.role;
  }
}