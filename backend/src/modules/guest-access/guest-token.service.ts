import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Etiqueta que entra en la firma. Separa este token de cualquier otro del
 * sistema que use el mismo algoritmo: aunque algún día compartieran secreto por
 * error, un token de recuperación de contraseña no validaría nunca como enlace
 * de huésped, ni al revés.
 */
const SIGNING_DOMAIN = 'guest-magiclink.v1';

/**
 * Versión del contenido. Va dentro del token para poder cambiar el formato más
 * adelante sin que los enlaces ya enviados empiecen a fallar de forma rara: un
 * token de otra versión se rechaza de inmediato y con un motivo claro.
 */
const PAYLOAD_VERSION = 1;

/** Lo que el token afirma. Solo es de fiar después de `verify`. */
export type GuestTokenPayload = {
  /** `id` interno de la reserva en Hostaway. */
  reservationId: number;
  /** Instante desde el que vale, en ms epoch. */
  notBefore: number;
  /** Instante hasta el que deja de valer, en ms epoch. */
  expiresAt: number;
  /**
   * Valor aleatorio. No se comprueba contra nada: está para que dos enlaces
   * emitidos para la misma reserva y la misma ventana no salgan idénticos.
   */
  nonce: string;
};

/** Forma compacta que viaja en la URL. Las claves son cortas a propósito. */
type WirePayload = {
  v: number;
  r: number;
  nb: number;
  ex: number;
  n: string;
};

/**
 * Genera y valida el token del magiclink del huésped.
 *
 * El token es **autocontenido y firmado**: no se guarda en ninguna tabla. Lleva
 * dentro a qué reserva pertenece y entre qué instantes vale, y una firma HMAC
 * que solo el servidor puede producir. El huésped puede leerlo —no hay nada
 * secreto ahí dentro— pero no puede fabricar uno ni correrle la fecha de
 * vencimiento sin la clave.
 *
 * Es el mismo mecanismo que `ResetTokenService` usa para la recuperación de
 * contraseña, con tres diferencias:
 *
 * 1. El sujeto es una **reserva**, no una cuenta. Es lo único que trae fechas
 *    de check-in y check-out, que es sobre lo que se calcula la vigencia.
 * 2. Vale **muchos usos** durante toda la estadía, no uno solo.
 * 3. Lleva `notBefore` además de `expiresAt`: el enlace se envía antes de que
 *    empiece la estadía, así que necesita también una fecha de arranque.
 *
 * Al no guardarse, **un enlace concreto no se puede revocar**. La revocación
 * efectiva la da `GuestAccessService`, que al validar consulta la reserva en
 * Hostaway: si se canceló o se acortó, el enlace deja de abrir aunque su firma
 * siga siendo buena.
 *
 * Formato: `base64url(payload).base64url(hmac)`
 */
@Injectable()
export class GuestTokenService {
  private readonly logger = new Logger(GuestTokenService.name);
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret =
      this.configService.get<string>('GUEST_MAGICLINK_SECRET')?.trim() ?? '';

    if (!this.secret) {
      this.logger.error(
        'GUEST_MAGICLINK_SECRET no está definida. Los enlaces de acceso del ' +
          'huésped quedarán deshabilitados hasta que se configure.',
      );
    }
  }

  isConfigured(): boolean {
    return this.secret.length > 0;
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.secret)
      .update(`${SIGNING_DOMAIN}:${encodedPayload}`)
      .digest('base64url');
  }

  /**
   * Arma un token para la reserva y la ventana indicadas. Las fechas las
   * calcula `GuestAccessService` a partir del check-in y el check-out; aquí
   * solo se firman.
   */
  create(reservationId: number, notBefore: number, expiresAt: number): string {
    const wire: WirePayload = {
      v: PAYLOAD_VERSION,
      r: reservationId,
      nb: notBefore,
      ex: expiresAt,
      n: randomBytes(9).toString('base64url'),
    };

    const encodedPayload = Buffer.from(JSON.stringify(wire), 'utf8').toString(
      'base64url',
    );

    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  /**
   * Lee el contenido **sin comprobar la firma**. Sirve para registrar en el log
   * a qué reserva apuntaba un token rechazado. Nunca debe usarse para
   * autorizar: para eso está `verify`.
   */
  decode(token: string): GuestTokenPayload | null {
    const [encodedPayload] = token.split('.');

    if (!encodedPayload) {
      return null;
    }

    try {
      const wire = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<WirePayload>;

      if (wire.v !== PAYLOAD_VERSION) return null;
      if (!Number.isInteger(wire.r) || (wire.r as number) <= 0) return null;
      if (!Number.isFinite(wire.nb) || !Number.isFinite(wire.ex)) return null;
      if (typeof wire.n !== 'string' || !wire.n) return null;

      return {
        reservationId: wire.r as number,
        notBefore: wire.nb as number,
        expiresAt: wire.ex as number,
        nonce: wire.n,
      };
    } catch {
      return null;
    }
  }

  /**
   * Comprueba firma y vigencia. Devuelve el contenido si el token es válido y
   * `null` en cualquier otro caso: firma mala, formato roto, todavía no empieza
   * o ya venció.
   */
  verify(token: string, now: number = Date.now()): GuestTokenPayload | null {
    if (!this.isConfigured()) {
      return null;
    }

    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      return null;
    }

    const expected = Buffer.from(this.sign(encodedPayload), 'utf8');
    const received = Buffer.from(signature, 'utf8');

    // La comparación debe ser de tiempo constante y timingSafeEqual exige
    // longitudes iguales, de ahí el chequeo previo.
    const signatureOk =
      expected.length === received.length &&
      timingSafeEqual(expected, received);

    if (!signatureOk) {
      return null;
    }

    // El contenido solo se interpreta después de validar la firma: así ningún
    // dato manipulado llega a usarse.
    const payload = this.decode(token);

    if (!payload) {
      return null;
    }

    if (now < payload.notBefore || now > payload.expiresAt) {
      return null;
    }

    return payload;
  }
}
