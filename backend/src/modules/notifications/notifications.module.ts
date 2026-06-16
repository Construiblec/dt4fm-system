import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { MailerService } from './mail/mailer.service';
import { TemplateRenderer } from './template-renderer.service';
import { SmtpMailProvider } from './mail/smtp-mail.provider';
import { ResendMailProvider } from './mail/resend-mail.provider';
import {
  MAIL_PROVIDER,
  type MailProvider,
} from './mail/mail-provider.interface';

/**
 * Factory del proveedor de correo.
 *
 * Para añadir un nuevo proveedor (SDK nativo de Brevo, SES, etc.):
 *   1. Crear la clase que implemente MailProvider en mail/.
 *   2. Añadir un case aquí.
 *   3. Cambiar MAIL_PROVIDER en .env.
 * Nada más cambia.
 */
function mailProviderFactory(config: ConfigService): MailProvider {
  const selected = (
    config.get<string>('MAIL_PROVIDER') ?? 'smtp'
  ).toLowerCase();

  switch (selected) {
    case 'resend':
      return new ResendMailProvider(config);
    case 'smtp':
    default:
      return new SmtpMailProvider(config);
  }
}

@Module({
  imports: [OpenmaintModule],
  controllers: [NotificationsController, EmailTemplatesController],
  providers: [
    NotificationsService,
    EmailTemplatesService,
    MailerService,
    TemplateRenderer,
    {
      provide: MAIL_PROVIDER,
      useFactory: mailProviderFactory,
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsService, MailerService],
})
export class NotificationsModule {}
