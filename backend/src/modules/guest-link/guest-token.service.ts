import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Etiqueta que entra en la firma. Separa este token de cualquier otro del
 * sistema que use el mismo algoritmo: aunque algún día compartieran secreto por
 * error, un token de recuperación de contraseña no validaría nunca como enlace
 * de huésped, ni al revés.
 */
const SIGNING_DOMAIN = 'guest-portal.v1';

/**
 * Versión del formato del contenido. No confundir con `tokenVersion`, que es el
 * contador por estancia: esta dice *cómo está escrito* el token, aquella dice
 * *qué generación de enlaces* sigue siendo válida para esa reserva.
 */
const PAYLOAD_VERSION = 1;

/** Lo que el token afirma. Solo es de fiar después de `verify`. */
export type GuestTokenPayload = {
  /** `guest_stay.id`. */
  stayId: string;
  /** Copia de `guest_stay.token_version` al emitirlo. */
  tokenVersion: number;
  /**
   * Valor aleatorio. No se comprueba contra nada: está para que dos enlaces
   * emitidos para la misma estancia no salgan idénticos.
   */
  nonce: string;
};

/** Forma compacta que viaja en la URL. Las claves son cortas a propósito. */
type WirePayload = {
  v: number;
  s: string;
  tv: number;
  n: string;
};

/** `guest_stay.id` es un uuid; cualquier otra cosa se rechaza antes de tocar la base. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Genera y valida el token del enlace del huésped.
 *
 * El token es **un puntero firmado, no un salvoconducto con fecha**: lleva a
 * qué estancia pertenece y de qué generación es, y nada más. Deliberadamente
 * **no lleva fechas**.
 *
 * Ese es el punto del diseño. Si el token grabara su vencimiento, extender el
 * check-out de una reserva obligaría a emitir y reenviar un enlace nuevo,
 * porque el enlace ya entregado seguiría diciendo la fecha vieja. Al leer la
 * vigencia de `guest_stay` en cada canje, el mismo enlace acompaña cualquier
 * cambio de fechas —adelantar la llegada, extender la salida— sin reenviar
 * nada, y el portal nunca puede discrepar de lo que acepta la puerta.
 *
 * La contrapartida: un enlace filtrado vale mientras la reserva viva. Es una
 * decisión tomada a conciencia —compartir el enlace es responsabilidad del
 * huésped— y `token_version` queda como freno de emergencia para invalidar
 * todos los enlaces de una estancia cuando haga falta.
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
        'GUEST_MAGICLINK_SECRET no está definida. El portal del huésped ' +
          'quedará deshabilitado hasta que se configure.',
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

  create(stayId: string, tokenVersion: number): string {
    const wire: WirePayload = {
      v: PAYLOAD_VERSION,
      s: stayId,
      tv: tokenVersion,
      n: randomBytes(9).toString('base64url'),
    };

    const encodedPayload = Buffer.from(JSON.stringify(wire), 'utf8').toString(
      'base64url',
    );

    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  /**
   * Lee el contenido **sin comprobar la firma**. Sirve para registrar en el log
   * a qué estancia apuntaba un token rechazado. Nunca debe usarse para
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
      if (typeof wire.s !== 'string' || !UUID_PATTERN.test(wire.s)) return null;
      if (!Number.isInteger(wire.tv) || (wire.tv as number) < 1) return null;
      if (typeof wire.n !== 'string' || !wire.n) return null;

      return {
        stayId: wire.s,
        tokenVersion: wire.tv as number,
        nonce: wire.n,
      };
    } catch {
      return null;
    }
  }

  /**
   * Comprueba la firma y devuelve el contenido. **No decide vigencia**: eso lo
   * hace `GuestPortalService` leyendo la estancia, porque las fechas viven en
   * la base y no aquí.
   */
  verify(token: string): GuestTokenPayload | null {
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
    return this.decode(token);
  }
}
