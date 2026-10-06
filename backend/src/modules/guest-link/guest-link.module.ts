import { Module } from '@nestjs/common';
import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostawayModule } from '../../integrations/hostaway/hostaway.module';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { MailerService } from '../notifications/mail/mailer.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailLinkChannel } from './delivery/email-link.channel';
import {
  GUEST_LINK_CHANNEL,
  GuestLinkChannel,
} from './delivery/guest-link-channel.interface';
import { HostawayMessageLinkChannel } from './delivery/hostaway-message-link.channel';
import { NoopLinkChannel } from './delivery/noop-link.channel';
import { RoutedLinkChannel } from './delivery/routed-link.channel';
import { WebhookLinkChannel } from './delivery/webhook-link.channel';
import { GuestLinkDelivery } from './entities/guest-link-delivery.entity';
import { GuestShortLink } from './entities/guest-short-link.entity';
import { GuestLinkService } from './guest-link.service';
import { GuestTokenService } from './guest-token.service';

/**
 * Factory del canal de entrega. Mismo esquema que el proveedor de correo:
 *
 *   1. Crear la clase que implemente GuestLinkChannel en delivery/.
 *   2. Añadir un case aquí.
 *   3. Cambiar GUEST_LINK_CHANNEL en .env.
 *
 * El defecto es `none`: un despliegue recién configurado no manda enlaces a
 * ninguna parte hasta que alguien lo decida.
 *
 * `hostaway` es un canal compuesto: mensaje en la conversación de Hostaway
 * para reservas de canal, correo para las directas, y correo de respaldo si el
 * mensaje falla. `email` manda siempre por correo.
 */
function guestLinkChannelFactory(
  config: ConfigService,
  http: HttpService,
  hostaway: HostawayService,
  mailer: MailerService,
): GuestLinkChannel {
  const selected = (
    config.get<string>('GUEST_LINK_CHANNEL') ?? 'none'
  ).toLowerCase();

  switch (selected) {
    case 'hostaway':
      return new RoutedLinkChannel(
        new HostawayMessageLinkChannel(hostaway),
        new EmailLinkChannel(mailer),
      );
    case 'email':
      return new EmailLinkChannel(mailer);
    case 'webhook':
      return new WebhookLinkChannel(http, config);
    case 'none':
    default:
      return new NoopLinkChannel();
  }
}

/**
 * Emisión y entrega del enlace del portal del huésped.
 *
 * No depende de `access-control` ni de `guest-portal`: es lo que permite que
 * ambos lo importen. `access-control` lo usa para entregar cuando nace una
 * estancia; `guest-portal`, para verificar el enlace cuando se abre.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GuestLinkDelivery, GuestShortLink]),
    HttpModule,
    HostawayModule,
    NotificationsModule,
  ],
  providers: [
    GuestTokenService,
    GuestLinkService,
    {
      provide: GUEST_LINK_CHANNEL,
      useFactory: guestLinkChannelFactory,
      inject: [ConfigService, HttpService, HostawayService, MailerService],
    },
  ],
  exports: [GuestTokenService, GuestLinkService],
})
export class GuestLinkModule {}
