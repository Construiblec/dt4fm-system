import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '../notifications/mail/mailer.service';
import {
  PasswordRecoveryOpenmaintService,
  type OpenmaintUserCard,
} from './password-recovery.openmaint.service';
import { ResetTokenService } from './reset-token.service';

/**
 * Respuesta única de `forgot-password`. Debe ser idéntica exista o no la
 * cuenta: cualquier diferencia convierte al endpoint en un enumerador de
 * usuarios.
 */
const GENERIC_RESPONSE = {
  message:
    'Si la cuenta existe y tiene un correo registrado, enviaremos un enlace ' +
    'para restablecer la contraseña.',
};

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  constructor(
    private readonly openmaint: PasswordRecoveryOpenmaintService,
    private readonly tokenService: ResetTokenService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * La respuesta que ve el cliente pase lo que pase. La expone el controlador
   * para poder devolver lo mismo cuando se supera el límite de peticiones.
   */
  genericResponse() {
    return GENERIC_RESPONSE;
  }

  async requestReset(usernameOrEmail: string) {
    // Cualquier fallo interno se traga a propósito: el mensaje genérico no
    // debe variar ni siquiera cuando openMAINT falla.
    try {
      await this.trySendResetEmail(usernameOrEmail.trim());
    } catch (error) {
      this.logger.error(
        `Fallo al procesar la recuperación: ${(error as Error).message}`,
      );
    }

    return GENERIC_RESPONSE;
  }

  private async trySendResetEmail(usernameOrEmail: string): Promise<void> {
    if (!usernameOrEmail || !this.tokenService.isConfigured()) {
      return;
    }

    const sessionId = await this.openmaint.getServiceSessionId();
    const candidates = await this.openmaint.findUsers(
      usernameOrEmail,
      sessionId,
    );

    const user = this.pickUser(candidates, usernameOrEmail);

    if (!user) {
      this.logger.log(
        `Recuperación solicitada para "${usernameOrEmail}": sin destinatario válido`,
      );
      return;
    }

    const token = this.tokenService.create(user._id, user.Password!);
    const link = `${this.getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

    const result = await this.mailerService.sendOne({
      to: user.Email!,
      subject: 'Restablece tu contraseña',
      html: this.buildEmailHtml(user.Username, link),
      text:
        `Recibimos una solicitud para restablecer la contraseña de ${user.Username}.\n\n` +
        `Abre este enlace para elegir una nueva:\n${link}\n\n` +
        `El enlace vence en 1 hora y solo puede usarse una vez. ` +
        `Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.`,
    });

    if (!result.success) {
      this.logger.error(
        `No se pudo enviar el correo de recuperación a ${user.Email}: ${result.error}`,
      );
    }
  }

  /**
   * Elige a quién enviarle el enlace.
   *
   * Un mismo correo puede estar repetido en varias cuentas de openMAINT (por
   * ejemplo `usuario.prueba` y `usuario.invitado` comparten dirección), así
   * que ante ambigüedad solo se procede si el texto coincide exactamente con
   * un `Username`. Si no, no se envía nada: restablecer la cuenta equivocada
   * —como la de invitados, que es compartida— haría más daño que no enviar.
   */
  private pickUser(
    candidates: OpenmaintUserCard[],
    usernameOrEmail: string,
  ): OpenmaintUserCard | null {
    const usable = candidates.filter(
      (candidate) =>
        candidate.Active &&
        !candidate.Service &&
        Boolean(candidate.Email?.trim()) &&
        Boolean(candidate.Password?.trim()),
    );

    if (usable.length === 1) {
      return usable[0];
    }

    if (usable.length > 1) {
      const exact = usable.filter(
        (candidate) =>
          candidate.Username.toLowerCase() === usernameOrEmail.toLowerCase(),
      );

      if (exact.length === 1) {
        return exact[0];
      }

      this.logger.warn(
        `"${usernameOrEmail}" coincide con ${usable.length} cuentas; no se envía por ambigüedad`,
      );
    }

    return null;
  }

  async resetPassword(token: string, newPassword: string) {
    if (!this.tokenService.isConfigured()) {
      throw new BadRequestException(
        'La recuperación de contraseña no está disponible en este momento.',
      );
    }

    const payload = this.tokenService.decode(token);

    if (!payload) {
      throw new BadRequestException(this.invalidTokenMessage());
    }

    const sessionId = await this.openmaint.getServiceSessionId();
    const card = await this.openmaint.getUserCard(payload.userId, sessionId);

    if (!card?.Password || !card.Active || card.Service) {
      throw new BadRequestException(this.invalidTokenMessage());
    }

    // Al firmar con el hash actual, un enlace ya usado no vuelve a validar:
    // el cambio de contraseña invalidó su firma.
    if (!this.tokenService.verify(token, card.Password)) {
      throw new BadRequestException(this.invalidTokenMessage());
    }

    const account = await this.openmaint.getUserAccount(
      payload.userId,
      sessionId,
    );

    if (!account) {
      throw new BadRequestException(this.invalidTokenMessage());
    }

    await this.openmaint.updatePassword(account, newPassword, sessionId);

    this.logger.log(`Contraseña restablecida para ${account.username}`);

    return { message: 'Tu contraseña se actualizó correctamente.' };
  }

  private invalidTokenMessage(): string {
    return (
      'El enlace no es válido o ya venció. Solicita uno nuevo desde ' +
      '"¿Olvidaste tu contraseña?".'
    );
  }

  private getAppBaseUrl(): string {
    return (
      this.configService.get<string>('APP_BASE_URL')?.replace(/\/$/, '') ?? ''
    );
  }

  private buildEmailHtml(username: string, link: string): string {
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#0f172a;line-height:1.6">
        <p>Hola <strong>${username}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p style="margin:28px 0">
          <a href="${link}"
             style="background:#0891b2;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:bold;display:inline-block">
            Restablecer contraseña
          </a>
        </p>
        <p style="color:#475569;font-size:13px">
          El enlace vence en 1 hora y solo puede usarse una vez.
        </p>
        <p style="color:#475569;font-size:13px">
          Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.
        </p>
        <p style="color:#94a3b8;font-size:12px;margin-top:28px;word-break:break-all">
          Si el botón no funciona, copia esta dirección en tu navegador:<br />${link}
        </p>
      </div>
    `.trim();
  }
}
