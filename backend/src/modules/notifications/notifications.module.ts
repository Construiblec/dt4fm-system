import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintModule } from '../../integrations/openmaint/openmaint.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { MailerService } from './mail/mailer.service';
import { TemplateRenderer } from './template-renderer.service';
import { SmtpMailProvider } from './mail/smtp-mail.provider';
import {
  MAIL_PROVIDER,
  MailProvider,
} from './mail/mail-provider.interface';

/**
 * Factory del proveedor de correo.
 *
 * Decide qué implementación de MailProvider se inyecta según la variable
 * de entorno MAIL_PROVIDER. Hoy solo existe SMTP (que ya cubre Brevo,
 * Mailtrap, SES, Gmail, etc. cambiando credenciales). Para añadir un
 * proveedor por API nativa (p. ej. SDK de Brevo o SES) basta con:
 *   1. Crear la clase que implemente MailProvider.
 *   2. Añadir un case aquí.
 * El resto del sistema no cambia.
 */
function mailProviderFactory(config: ConfigService): MailProvider {
  const selected = (config.get<string>('MAIL_PROVIDER') ?? 'smtp').toLowerCase();

  switch (selected) {
    case 'smtp':
    default:
      return new SmtpMailProvider(config);
  }
}

@Module({
  imports: [OpenmaintModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    MailerService,
    TemplateRenderer,
    {
      provide: MAIL_PROVIDER,
      useFactory: mailProviderFactory,
      inject: [ConfigService],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
