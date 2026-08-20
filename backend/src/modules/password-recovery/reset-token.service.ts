import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/** Validez del enlace de recuperación. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

type TokenPayload = {
  userId: number;
  expiresAt: number;
};

/**
 * Genera y valida los tokens del enlace de recuperación.
 *
 * El token es **autocontenido y firmado**: no se guarda en ninguna parte. Esto
 * es deliberado, porque el backend no tiene base de datos propia y openMAINT no
 * permite escribir el campo `RecoveryToken` de la clase `User`
 * (`writable: false`); guardarlo en memoria tampoco sirve, ya que Render
 * duerme y reinicia la instancia.
 *
 * La clave de firma se deriva del **hash de contraseña actual** del usuario.
 * De ahí sale la propiedad más importante: al cambiar la contraseña el hash
 * cambia, la firma deja de validar y **todos los enlaces emitidos quedan
 * invalidados automáticamente**. Eso da un solo uso real sin almacenar nada.
 *
 * Formato: `base64url(userId.expiresAt).base64url(hmac)`
 */
@Injectable()
export class ResetTokenService {
  private readonly logger = new Logger(ResetTokenService.name);
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('PASSWORD_RESET_SECRET')?.trim() ?? '';

    if (!this.secret) {
      this.logger.error(
        'PASSWORD_RESET_SECRET no está definida. La recuperación de ' +
          'contraseña quedará deshabilitada hasta que se configure.',
      );
    }
  }

  isConfigured(): boolean {
    return this.secret.length > 0;
  }

  /**
   * Clave de firma propia de cada usuario. Mezcla el secreto del servidor con
   * el hash de contraseña, de modo que la firma solo es reproducible mientras
   * la contraseña no cambie.
   */
  private signingKey(passwordHash: string): Buffer {
    return createHmac('sha256', this.secret).update(passwordHash).digest();
  }

  private sign(encodedPayload: string, passwordHash: string): string {
    return createHmac('sha256', this.signingKey(passwordHash))
      .update(encodedPayload)
      .digest('base64url');
  }

  create(userId: number, passwordHash: string): string {
    const payload = `${userId}.${Date.now() + TOKEN_TTL_MS}`;
    const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');

    return `${encodedPayload}.${this.sign(encodedPayload, passwordHash)}`;
  }

  /**
   * Lee el contenido del token **sin comprobar la firma**, solo para saber a
   * qué usuario hay que consultarle el hash. Nunca debe usarse para autorizar:
   * para eso está `verify`.
   */
  decode(token: string): TokenPayload | null {
    const [encodedPayload] = token.split('.');

    if (!encodedPayload) {
      return null;
    }

    try {
      const [rawUserId, rawExpiresAt] = Buffer.from(encodedPayload, 'base64url')
        .toString('utf8')
        .split('.');

      const userId = Number(rawUserId);
      const expiresAt = Number(rawExpiresAt);

      if (!Number.isInteger(userId) || userId <= 0) return null;
      if (!Number.isFinite(expiresAt)) return null;

      return { userId, expiresAt };
    } catch {
      return null;
    }
  }

  /** Comprueba firma y vigencia. */
  verify(token: string, passwordHash: string): boolean {
    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      return false;
    }

    const payload = this.decode(token);

    if (!payload || payload.expiresAt < Date.now()) {
      return false;
    }

    const expected = Buffer.from(
      this.sign(encodedPayload, passwordHash),
      'utf8',
    );
    const received = Buffer.from(signature, 'utf8');

    // La comparación debe ser de tiempo constante y timingSafeEqual exige
    // longitudes iguales, de ahí el chequeo previo.
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }
}
