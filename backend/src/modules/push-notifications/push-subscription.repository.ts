import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationDispatchLog } from './entities/notification-dispatch-log.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushMessage } from './notification-catalog';

export type SaveSubscriptionInput = {
  userId: string;
  username: string;
  roles: string[];
  employeeId: number | null;
  cleaningEmployeeId: number | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

/**
 * Único punto de acceso a las tablas de push. Los servicios no usan repositorios
 * de TypeORM directamente, para poder cambiar el almacén sin tocar la lógica.
 */
@Injectable()
export class PushSubscriptionRepository {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(NotificationDispatchLog)
    private readonly dispatchLog: Repository<NotificationDispatchLog>,
  ) {}

  /**
   * Alta o actualización sobre `endpoint`. El endpoint pertenece al dispositivo,
   * no a la persona: en un celular compartido esto reasigna la suscripción al
   * usuario que acaba de entrar en vez de dejar dos filas y notificar a ambos.
   */
  async saveSubscription(input: SaveSubscriptionInput): Promise<void> {
    await this.subscriptions.upsert(
      { ...input, lastSeenAt: new Date(), failureCount: 0 },
      { conflictPaths: ['endpoint'] },
    );
  }

  findByRoles(roles: string[]): Promise<PushSubscription[]> {
    return this.subscriptions
      .createQueryBuilder('sub')
      .where('sub.roles && :roles', { roles })
      .getMany();
  }

  findByEmployeeId(employeeId: number): Promise<PushSubscription[]> {
    return this.subscriptions.find({ where: { employeeId } });
  }

  findByCleaningEmployeeId(
    cleaningEmployeeId: number,
  ): Promise<PushSubscription[]> {
    return this.subscriptions.find({ where: { cleaningEmployeeId } });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.subscriptions.delete({ endpoint });
  }

  async incrementFailureCount(id: string): Promise<void> {
    await this.subscriptions.increment({ id }, 'failureCount', 1);
  }

  async saveNotification(
    userId: string,
    message: PushMessage,
  ): Promise<Notification> {
    return this.notifications.save(
      this.notifications.create({
        userId,
        type: message.type,
        title: message.title,
        body: message.body,
        deepLink: message.deepLink,
        entityKind: message.entityKind,
        entityId: message.entityId,
      }),
    );
  }

  /**
   * Reserva un evento de scheduler. Devuelve `true` solo la primera vez, así un
   * reinicio a mitad de barrido no reenvía lo ya enviado.
   */
  async claimDispatch(eventKey: string): Promise<boolean> {
    const inserted = (await this.dispatchLog.query(
      `INSERT INTO notification_dispatch_log (event_key) VALUES ($1)
       ON CONFLICT (event_key) DO NOTHING RETURNING event_key`,
      [eventKey],
    )) as unknown[];

    return inserted.length > 0;
  }
}
