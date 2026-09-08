import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Cifra y descifra el PIN, y calcula su huella.
 *
 * El PIN va cifrado y no hasheado porque el portal tendrá que mostrárselo al
 * huésped cada vez que abra el panel, no solo al emitirlo. Se compensa con dos
 * claves separadas —comprometer la huella no ayuda a descifrar— y con que
 * `decrypt()` se llame desde un único punto del código.
 */
@Injectable()
export class PinCipherService {
  private readonly logger = new Logger(PinCipherService.name);
  private readonly key: Buffer | null;
  private readonly fingerprintKey: Buffer | null;

  constructor(configService: ConfigService) {
    this.key = this.readKey(configService, 'ACCESS_PIN_KEY');
    this.fingerprintKey = this.readKey(
      configService,
      'ACCESS_PIN_FINGERPRINT_KEY',
    );
  }

  isConfigured(): boolean {
    return this.key !== null && this.fingerprintKey !== null;
  }

  encrypt(pin: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(pin, 'utf8'),
      cipher.final(),
    ]);

    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  /** Único punto del código autorizado a revelar un PIN. */
  decrypt(payload: string): string {
    const key = this.requireKey();
    const parts = (payload ?? '').split(':');

    if (parts.length !== 3) {
      throw new Error('Formato de PIN cifrado inválido');
    }

    const [iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, 'base64url'),
    );

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    // GCM detecta manipulación aquí: final() lanza si el tag no cuadra.
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Permite comprobar unicidad, enfriamiento y coincidencias sin descifrar. */
  fingerprint(pin: string): string {
    if (this.fingerprintKey === null) {
      throw new ServiceUnavailableException(
        'El control de accesos no está configurado',
      );
    }

    return createHmac('sha256', this.fingerprintKey).update(pin).digest('hex');
  }

  private requireKey(): Buffer {
    if (this.key === null) {
      throw new ServiceUnavailableException(
        'El control de accesos no está configurado',
      );
    }

    return this.key;
  }

  /**
   * Ausente o con longitud incorrecta se trata igual: el servicio queda sin
   * configurar y cualquier uso responde 503, en vez de emitir con una clave
   * que no es la que se cree.
   */
  private readKey(configService: ConfigService, name: string): Buffer | null {
    const raw = configService.get<string>(name)?.trim() ?? '';

    if (!raw) {
      this.logger.error(
        `${name} no está definida: el control de accesos queda deshabilitado`,
      );
      return null;
    }

    const key = Buffer.from(raw, 'base64');

    if (key.length !== KEY_BYTES) {
      this.logger.error(
        `${name} debe decodificar a ${KEY_BYTES} bytes en base64; llegaron ${key.length}`,
      );
      return null;
    }

    return key;
  }
}
