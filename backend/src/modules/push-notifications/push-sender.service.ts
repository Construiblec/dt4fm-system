import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { PushMessage } from './notification-catalog';
import { PushSubscriptionRepository } from './push-subscription.repository';

/** Envíos simultáneos por lote; evita abrir cientos de conexiones a la vez. */
const SEND_CONCURRENCY = 10;

@Injectable()
export class PushSenderService implements OnModuleInit {
  private readonly logger = new Logger(PushSenderService.name);
  private configured = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: PushSubscriptionRepository,
  ) {}

  onModuleInit(): void {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT');

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn(
        'Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT: ' +
          'el envío de push queda desactivado.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
  }

  get isConfigured(): boolean {
    return this.configured;
  }

  async send(
    subscriptions: PushSubscription[],
    message: PushMessage,
  ): Promise<void> {
    if (!this.configured || subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      deepLink: message.deepLink,
      // Agrupa por entidad: un reaviso reemplaza al anterior en vez de apilarse.
      tag: `${message.entityKind}-${message.entityId}`,
      type: message.type,
    });

    for (let i = 0; i < subscriptions.length; i += SEND_CONCURRENCY) {
      const batch = subscriptions.slice(i, i + SEND_CONCURRENCY);
      await Promise.all(batch.map((sub) => this.sendOne(sub, payload)));
    }
  }

  private async sendOne(
    subscription: PushSubscription,
    payload: string,
  ): Promise<void> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;

      // 404/410: el navegador ya descartó la suscripción; si no se borra, la
      // tabla acumula zombies y cada envío gasta peticiones contra ellos.
      if (status === 404 || status === 410) {
        await this.repository.deleteByEndpoint(subscription.endpoint);
        return;
      }

      await this.repository.incrementFailureCount(subscription.id);
      this.logger.warn(
        `Push fallido (${status ?? 'sin código'}) a ` +
          `${subscription.endpoint.slice(0, 60)}…`,
      );
    }
  }
}
