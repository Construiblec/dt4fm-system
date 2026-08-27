import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenmaintService,
  OpenmaintSession,
} from '../../integrations/openmaint/openmaint.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushIdentityService } from './push-identity.service';
import { PushSubscriptionRepository } from './push-subscription.repository';

@Injectable()
export class PushSubscriptionService {
  private readonly logger = new Logger(PushSubscriptionService.name);

  constructor(
    private readonly repository: PushSubscriptionRepository,
    private readonly openmaintService: OpenmaintService,
    private readonly identity: PushIdentityService,
    private readonly configService: ConfigService,
  ) {}

  getVapidPublicKey(): string {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  /**
   * Da de alta la suscripción resolviendo la identidad contra openMAINT. La
   * sesión es la única fuente: de ella salen el usuario y sus roles, así que el
   * cliente no puede suscribirse como otra persona ni inventarse un rol.
   */
  async subscribe(
    sessionId: string,
    dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    const session = await this.identity.resolveSession(sessionId);
    const roles = this.resolveRoles(session);

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
      roles,
      employeeId,
      cleaningEmployeeId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    });

    this.logger.log(
      `Suscripción push registrada: ${session.username} ` +
        `roles=[${roles.join(', ')}] employeeId=${employeeId ?? '-'} ` +
        `cleaningEmployeeId=${cleaningEmployeeId ?? '-'}`,
    );
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repository.deleteByEndpoint(endpoint);
  }

  private resolveRoles(session: OpenmaintSession): string[] {
    // `filter(Boolean)` no estrecha el tipo, y `role` puede venir vacío en una
    // sesión multigrupo todavía sin grupo activo.
    const roles = new Set(
      [...(session.availableRoles ?? []), session.role].filter(
        (role): role is string => Boolean(role),
      ),
    );

    return [...roles];
  }
}
