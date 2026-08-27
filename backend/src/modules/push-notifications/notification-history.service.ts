import { Injectable } from '@nestjs/common';
import { Notification } from './entities/notification.entity';
import { PushIdentityService } from './push-identity.service';
import { PushSubscriptionRepository } from './push-subscription.repository';

/** Lo que consume la campana del frontend. */
export type NotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  entityKind: string | null;
  entityId: string | null;
  createdAt: string;
  read: boolean;
};

export type ListOptions = {
  limit?: number;
  /** ISO de la última notificación recibida, para pedir la página siguiente. */
  before?: string;
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Lado de lectura del historial. El de escritura ya lo cubre
 * `PushDispatchService`, que guarda una fila por destinatario al notificar.
 */
@Injectable()
export class NotificationHistoryService {
  constructor(
    private readonly repository: PushSubscriptionRepository,
    private readonly identity: PushIdentityService,
  ) {}

  async list(
    sessionId: string,
    { limit, before }: ListOptions = {},
  ): Promise<{ notifications: NotificationView[]; unread: number }> {
    const userId = await this.identity.resolveUserId(sessionId);

    const [rows, unread] = await Promise.all([
      this.repository.findNotifications(userId, {
        limit: this.normalizeLimit(limit),
        before: this.parseBefore(before),
      }),
      this.repository.countUnread(userId),
    ]);

    // El contador viaja con la lista para que la campana no pida dos veces.
    return { notifications: rows.map(toView), unread };
  }

  async countUnread(sessionId: string): Promise<{ unread: number }> {
    const userId = await this.identity.resolveUserId(sessionId);

    return { unread: await this.repository.countUnread(userId) };
  }

  /**
   * Idempotente: marcar una ya leída, o una que no es del usuario, no es un
   * error — devuelve el contador para que la campana se corrija igualmente.
   */
  async markRead(sessionId: string, id: string): Promise<{ unread: number }> {
    const userId = await this.identity.resolveUserId(sessionId);
    await this.repository.markRead(userId, id);

    return { unread: await this.repository.countUnread(userId) };
  }

  async markAllRead(sessionId: string): Promise<{ unread: number }> {
    const userId = await this.identity.resolveUserId(sessionId);
    await this.repository.markAllRead(userId);

    return { unread: 0 };
  }

  private normalizeLimit(limit?: number): number {
    if (!limit || !Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_LIMIT;
    }

    return Math.min(Math.trunc(limit), MAX_LIMIT);
  }

  private parseBefore(before?: string): Date | undefined {
    if (!before) {
      return undefined;
    }

    const date = new Date(before);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}

const toView = (row: Notification): NotificationView => ({
  id: row.id,
  type: row.type,
  title: row.title,
  body: row.body,
  deepLink: row.deepLink,
  entityKind: row.entityKind,
  entityId: row.entityId,
  createdAt: row.createdAt.toISOString(),
  read: row.readAt !== null,
});
