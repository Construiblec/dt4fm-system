import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';
import { AccessCredential } from './entities/access-credential.entity';
import { PinCipherService } from './pin-cipher.service';

const DEFAULT_LENGTH = 4;
const DEFAULT_COOLDOWN_DAYS = 30;
const MAX_ATTEMPTS = 50;

export interface GeneratedPin {
  pin: string;
  fingerprint: string;
}

/**
 * El único sitio donde nace un PIN.
 *
 * Con cuatro dígitos hay 10 000 combinaciones, así que descartar las débiles
 * pesa más que con seis: son las que un huésped teclea por instinto y un
 * atacante prueba primero.
 */
@Injectable()
export class PinGeneratorService {
  private readonly logger = new Logger(PinGeneratorService.name);

  constructor(
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly cipher: PinCipherService,
    private readonly configService: ConfigService,
  ) {}

  async generate(buildingId: number): Promise<GeneratedPin> {
    const length = this.pinLength();
    const cutoff = this.cooldownCutoff();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const pin = this.randomPin(length);

      if (this.isWeak(pin)) {
        continue;
      }

      const fingerprint = this.cipher.fingerprint(pin);

      if (await this.isTaken(buildingId, fingerprint)) {
        continue;
      }

      if (await this.isCoolingDown(buildingId, fingerprint, cutoff)) {
        continue;
      }

      return { pin, fingerprint };
    }

    // Espacio agotado es una alerta operativa, no algo que se reintente sin fin.
    this.logger.error(
      `No se encontró un PIN libre en el edificio ${buildingId} tras ${MAX_ATTEMPTS} intentos`,
    );
    throw new ServiceUnavailableException(
      'No hay PINes disponibles en este edificio',
    );
  }

  /** Rechaza repeticiones, escaleras y años: ~2 % del espacio de 4 dígitos. */
  isWeak(pin: string): boolean {
    if (/^(\d)\1*$/.test(pin)) {
      return true;
    }

    const digits = [...pin].map(Number);
    const ascending = digits.every(
      (digit, index) => index === 0 || digit === digits[index - 1] + 1,
    );
    const descending = digits.every(
      (digit, index) => index === 0 || digit === digits[index - 1] - 1,
    );

    if (ascending || descending) {
      return true;
    }

    return pin.length === 4 && /^(19|20)\d{2}$/.test(pin);
  }

  private randomPin(length: number): string {
    let pin = '';

    for (let index = 0; index < length; index += 1) {
      pin += String(randomInt(0, 10));
    }

    return pin;
  }

  private async isTaken(
    buildingId: number,
    fingerprint: string,
  ): Promise<boolean> {
    const count = await this.credentials
      .createQueryBuilder('credential')
      .where('credential.building_id = :buildingId', { buildingId })
      .andWhere('credential.pin_fingerprint = :fingerprint', { fingerprint })
      .andWhere("credential.status IN ('pending', 'active')")
      .getCount();

    return count > 0;
  }

  /**
   * Un PIN liberado no se reasigna de inmediato: el huésped anterior lo
   * recuerda, y una cerradura no distingue memoria de autorización.
   */
  private async isCoolingDown(
    buildingId: number,
    fingerprint: string,
    cutoff: Date,
  ): Promise<boolean> {
    const count = await this.credentials
      .createQueryBuilder('credential')
      .where('credential.building_id = :buildingId', { buildingId })
      .andWhere('credential.pin_fingerprint = :fingerprint', { fingerprint })
      .andWhere(
        '(credential.valid_to > :cutoff OR credential.updated_at > :cutoff)',
        { cutoff },
      )
      .getCount();

    return count > 0;
  }

  private pinLength(): number {
    const raw = Number(this.configService.get<string>('ACCESS_PIN_LENGTH'));

    return Number.isInteger(raw) && raw >= 4 && raw <= 8 ? raw : DEFAULT_LENGTH;
  }

  private cooldownCutoff(): Date {
    const raw = Number(
      this.configService.get<string>('ACCESS_PIN_COOLDOWN_DAYS'),
    );
    const days =
      Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_COOLDOWN_DAYS;

    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
