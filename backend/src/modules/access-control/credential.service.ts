import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { AccessIotGateway } from './access-iot.gateway';
import { CredentialWriteResult } from './access-iot.types';
import { BuildingCatalogService } from './building-catalog.service';
import {
  AccessCredential,
  CredentialScope,
  CredentialStatus,
  SubjectType,
} from './entities/access-credential.entity';
import { PinCipherService } from './pin-cipher.service';
import { PinGeneratorService } from './pin-generator.service';

/** Estados en los que la credencial todavía debería abrir una puerta. */
export const LIVE_STATUSES = ['pending', 'active'];

const MAX_PIN_CONFLICT_RETRIES = 3;

export interface IssueCredentialInput {
  subjectType: SubjectType;
  subjectRef: string;
  displayName: string;
  scope: CredentialScope;
  buildingId: number;
  openmaintUnitId?: number | null;
  validFrom: Date;
  validTo: Date;
  issuedBy: string;
  guestStayId?: string | null;
}

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly generator: PinGeneratorService,
    private readonly cipher: PinCipherService,
    private readonly catalog: BuildingCatalogService,
    private readonly iot: AccessIotGateway,
  ) {}

  /**
   * Idempotente por sujeto y ámbito: si ya hay una credencial viva, se devuelve
   * esa. Evita la doble emisión cuando el webhook y el barrido diario coinciden.
   */
  async issue(input: IssueCredentialInput): Promise<AccessCredential> {
    const existing = await this.findLive(
      input.subjectType,
      input.subjectRef,
      input.scope,
    );

    if (existing) {
      return existing;
    }

    if (!(await this.catalog.isCovered(input.buildingId))) {
      throw new BadRequestException(
        `El edificio ${input.buildingId} no tiene control de accesos instalado`,
      );
    }

    if (input.validTo <= input.validFrom) {
      throw new BadRequestException(
        'La vigencia debe terminar después de empezar',
      );
    }

    const credential = await this.persistWithFreshPin(input);

    return this.sync(credential);
  }

  async revoke(id: string, reason: string): Promise<AccessCredential> {
    const credential = await this.credentials.findOne({ where: { id } });

    if (!credential) {
      throw new NotFoundException('Credencial no encontrada');
    }

    if (credential.status === 'revoked') {
      return credential;
    }

    credential.status = 'revoked';
    credential.revokedReason = reason;
    credential.syncState = 'pending';
    credential.syncAttempts = 0;
    await this.credentials.save(credential);

    return this.sync(credential);
  }

  /** Revoca en bloque; se usa al cancelarse una reserva. */
  async revokeByGuestStay(
    guestStayId: string,
    reason: string,
  ): Promise<number> {
    const live = await this.credentials.find({
      where: { guestStayId, status: In(LIVE_STATUSES) },
    });

    for (const credential of live) {
      await this.revoke(credential.id, reason);
    }

    return live.length;
  }

  /**
   * Mueve la vigencia **sin tocar el PIN**: cambiarlo por un cambio de fechas
   * confundiría al huésped, que ya lo tiene anotado.
   */
  async reschedule(
    id: string,
    validFrom: Date,
    validTo: Date,
  ): Promise<AccessCredential> {
    const credential = await this.credentials.findOne({ where: { id } });

    if (!credential) {
      throw new NotFoundException('Credencial no encontrada');
    }

    if (validTo <= validFrom) {
      throw new BadRequestException(
        'La vigencia debe terminar después de empezar',
      );
    }

    credential.validFrom = validFrom;
    credential.validTo = validTo;
    credential.syncState = 'pending';
    credential.syncAttempts = 0;
    await this.credentials.save(credential);

    return this.sync(credential);
  }

  /**
   * Empuja el estado deseado a la VPS y anota el resultado. La llamada externa
   * queda fuera de cualquier transacción: si el proceso muere aquí, la fila ya
   * está en `pending` y el barrido de reintentos la recoge.
   */
  async sync(credential: AccessCredential): Promise<AccessCredential> {
    try {
      const result =
        credential.status === 'revoked' || credential.status === 'expired'
          ? await this.iot.deleteCredential(credential.id)
          : await this.write(credential);

      return this.applyResult(credential, result);
    } catch (error) {
      credential.syncAttempts += 1;
      credential.syncState = 'pending';
      this.logger.warn(
        `Sincronización fallida de ${credential.id}: ${this.describe(error)}`,
      );
      return this.credentials.save(credential);
    }
  }

  async list(filters: {
    subject?: string;
    status?: CredentialStatus;
    buildingId?: number;
    limit?: number;
  }): Promise<AccessCredential[]> {
    const where: FindOptionsWhere<AccessCredential> = {};

    if (filters.subject) where.subjectRef = filters.subject;
    if (filters.status) where.status = filters.status;
    if (filters.buildingId) where.buildingId = filters.buildingId;

    return this.credentials.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(filters.limit ?? 50, 200),
    });
  }

  async findById(id: string): Promise<AccessCredential> {
    const credential = await this.credentials.findOne({ where: { id } });

    if (!credential) {
      throw new NotFoundException('Credencial no encontrada');
    }

    return credential;
  }

  /** `failed` significa que existe en el sistema pero no en la puerta, o al revés. */
  async countFailed(): Promise<number> {
    return this.credentials.count({ where: { syncState: 'failed' } });
  }

  async findLive(
    subjectType: SubjectType,
    subjectRef: string,
    scope: CredentialScope,
  ): Promise<AccessCredential | null> {
    return this.credentials.findOne({
      where: { subjectType, subjectRef, scope, status: In(LIVE_STATUSES) },
    });
  }

  /** Único punto del código que revela un PIN. */
  revealPin(credential: AccessCredential): string {
    return this.cipher.decrypt(credential.pinCiphertext);
  }

  private async write(
    credential: AccessCredential,
  ): Promise<CredentialWriteResult> {
    let current = credential;

    for (let attempt = 1; attempt <= MAX_PIN_CONFLICT_RETRIES; attempt += 1) {
      const result = await this.iot.putCredential(current.id, {
        buildingId: current.buildingId,
        scope: current.scope,
        subjectType: current.subjectType,
        pin: this.cipher.decrypt(current.pinCiphertext),
        validFrom: current.validFrom.toISOString(),
        validTo: current.validTo.toISOString(),
        displayName: current.displayName,
        unitId: current.openmaintUnitId,
      });

      // El terminal comparte espacio de PINes con usuarios cargados a mano, que
      // el backend no conoce: la única salida es regenerar y reintentar.
      if (result.errorCode !== 'pin_conflict') {
        return result;
      }

      this.logger.warn(
        `PIN en conflicto para ${current.id}; se regenera (intento ${attempt})`,
      );
      current = await this.rotatePin(current);
    }

    return {
      credentialId: current.id,
      state: 'failed',
      devices: [],
      errorCode: 'pin_conflict',
    };
  }

  private async persistWithFreshPin(
    input: IssueCredentialInput,
  ): Promise<AccessCredential> {
    const { pin, fingerprint } = await this.generator.generate(
      input.buildingId,
    );

    return this.credentials.save(
      this.credentials.create({
        subjectType: input.subjectType,
        subjectRef: input.subjectRef,
        displayName: input.displayName,
        scope: input.scope,
        buildingId: input.buildingId,
        openmaintUnitId: input.openmaintUnitId ?? null,
        pinCiphertext: this.cipher.encrypt(pin),
        pinFingerprint: fingerprint,
        validFrom: input.validFrom,
        validTo: input.validTo,
        status: 'pending',
        issuedBy: input.issuedBy,
        guestStayId: input.guestStayId ?? null,
        syncState: 'pending',
        syncAttempts: 0,
      }),
    );
  }

  private async rotatePin(
    credential: AccessCredential,
  ): Promise<AccessCredential> {
    const { pin, fingerprint } = await this.generator.generate(
      credential.buildingId,
    );

    credential.pinCiphertext = this.cipher.encrypt(pin);
    credential.pinFingerprint = fingerprint;

    return this.credentials.save(credential);
  }

  private async applyResult(
    credential: AccessCredential,
    result: CredentialWriteResult,
  ): Promise<AccessCredential> {
    credential.syncDetail = result.devices ?? [];
    credential.syncAttempts += 1;

    if (result.state === 'written') {
      credential.syncState = 'synced';

      // `pending` no significa «no funciona»: significa «aún no está en todas
      // las puertas». Solo cuando lo está pasa a activa.
      if (credential.status === 'pending') {
        credential.status = 'active';
      }
    } else if (result.state === 'failed') {
      credential.syncState = 'failed';
      this.logger.error(
        `Escritura fallida de ${credential.id}: ${result.errorCode ?? 'sin código'}`,
      );
    } else {
      credential.syncState = 'pending';
    }

    return this.credentials.save(credential);
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
