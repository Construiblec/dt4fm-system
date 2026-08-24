import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenmaintService,
  OpenmaintUserAccount,
} from '../../integrations/openmaint/openmaint.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushSubscriptionRepository } from './push-subscription.repository';

@Injectable()
export class PushSubscriptionService {
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
   * llamada a `/users/{id}` cumple doble función: valida que el sessionId sea
   * real (un 401 corta aquí) y devuelve los grupos para fijar el rol.
   */
  async subscribe(
    sessionId: string,
    claimedRole: string | undefined,
    dto: CreatePushSubscriptionDto,
  ): Promise<void> {
    const userId = Number(dto.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('userId inválido');
    }

    let account: OpenmaintUserAccount | null;
    try {
      account = await this.openmaintService.getUserAccount(userId, sessionId);
    } catch {
      throw new UnauthorizedException('Sesión de openMAINT no válida');
    }

    if (!account) {
      throw new UnauthorizedException('Usuario no encontrado en openMAINT');
    }

    const role = this.resolveRole(account, claimedRole);

    const [employeeId, cleaningEmployeeId] = await Promise.all([
      this.openmaintService.resolveEmployeeId(userId, sessionId),
      this.openmaintService.resolveCleaningEmployeeId(
        account.username,
        sessionId,
      ),
    ]);

    await this.repository.saveSubscription({
      userId: String(userId),
      username: account.username,
      role,
      employeeId,
      cleaningEmployeeId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.repository.deleteByEndpoint(endpoint);
  }

  /**
   * Acepta el rol que declara el cliente solo si el usuario pertenece de verdad
   * a ese grupo en openMAINT; si no, cae al grupo por defecto de la cuenta.
   * Un usuario puede estar en varios grupos, de ahí que no baste con el primero.
   */
  private resolveRole(
    account: OpenmaintUserAccount,
    claimedRole?: string,
  ): string {
    const groups = account.userGroups ?? [];
    const names = groups.map((group) => group.name);

    if (claimedRole && names.includes(claimedRole)) {
      return claimedRole;
    }

    const fallback =
      groups.find((group) => group._id === account.defaultUserGroup)?.name ??
      names[0];

    if (!fallback) {
      throw new BadRequestException(
        'El usuario no pertenece a ningún grupo de openMAINT',
      );
    }

    return fallback;
  }
}
