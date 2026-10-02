import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  AES_KEY_BYTES,
  decryptAesGcm,
  encryptAesGcm,
} from '../../common/utils/aes-gcm.util';

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
    return encryptAesGcm(this.requireKey(), pin);
  }

  /** Único punto del código autorizado a revelar un PIN. */
  decrypt(payload: string): string {
    return decryptAesGcm(this.requireKey(), payload, 'PIN cifrado');
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

    if (key.length !== AES_KEY_BYTES) {
      this.logger.error(
        `${name} debe decodificar a ${AES_KEY_BYTES} bytes en base64; llegaron ${key.length}`,
      );
      return null;
    }

    return key;
  }
}
