import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { AccessIotGateway } from './access-iot.gateway';
import {
  CredentialDeviceResult,
  CredentialWriteResult,
  DeviceScope,
} from './access-iot.types';
import { BuildingCatalogService } from './building-catalog.service';
import {
  deriveEmployeeNo,
  intersectScopes,
  normalizeScopes,
  sameScopes,
  SCOPE_ORDER,
  scopesOf,
  subtractScopes,
  toWireScope,
  unionScopes,
} from './credential-scopes';
import {
  AccessCredential,
  CredentialScope,
  CredentialStatus,
  SubjectType,
} from './entities/access-credential.entity';
import { toWireTimestamp } from './guest-stay-timing';
import { PinCipherService } from './pin-cipher.service';
import { PinGeneratorService } from './pin-generator.service';

/** Estados en los que la credencial todavía debería abrir una puerta. */
export const LIVE_STATUSES = ['pending', 'active'];

const MAX_PIN_CONFLICT_RETRIES = 3;

/** Tope de la VPS; el nombre completo se conserva aquí. */
const DISPLAY_NAME_MAX = 128;

/** `syncError` de una ampliación abortada: el PIN choca con otro usuario del scope nuevo. */
export const PIN_CONFLICT_ERROR = 'pin_conflict';

/** `syncError` de un sitio fuera de `ACCESS_SCOPED_SITES`: no recibe mutaciones. */
export const SITE_FROZEN_ERROR = 'site_frozen';

/**
 * `legacy`: contrato anterior (PUT con el ámbito completo, DELETE sin body).
 * `scoped`: diferencias por scope contra la API central. `frozen`: no sale nada.
 */
type SiteMode =
  | { kind: 'legacy' }
  | { kind: 'scoped'; siteId: string }
  | { kind: 'frozen' };

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
  /** No espera a la VPS: la fila ya queda en `pending` para `sync-retry`. */
  deferSync?: boolean;
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
    private readonly config: ConfigService,
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

    // La VPS rechaza con 400 un ámbito sin puertas: mejor decirlo antes de crear la fila.
    await this.assertScopeAvailable(input.buildingId, input.scope);

    if (input.validTo <= input.validFrom) {
      throw new BadRequestException(
        'La vigencia debe terminar después de empezar',
      );
    }

    const credential = await this.persistWithFreshPin(input);

    return this.push(credential, input.deferSync);
  }

  async revoke(
    id: string,
    reason: string,
    deferSync = false,
  ): Promise<AccessCredential> {
    return this.mutate(
      id,
      (credential) => {
        if (credential.status === 'revoked') {
          return false;
        }

        credential.status = 'revoked';
        credential.revokedReason = reason;
      },
      deferSync,
    );
  }

  /** Revoca en bloque; se usa al cancelarse una reserva. */
  async revokeByGuestStay(
    guestStayId: string,
    reason: string,
    deferSync = false,
  ): Promise<number> {
    const live = await this.credentials.find({
      where: { guestStayId, status: In(LIVE_STATUSES) },
    });

    for (const credential of live) {
      await this.revoke(credential.id, reason, deferSync);
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
    deferSync = false,
  ): Promise<AccessCredential> {
    if (validTo <= validFrom) {
      throw new BadRequestException(
        'La vigencia debe terminar después de empezar',
      );
    }

    return this.mutate(
      id,
      (credential) => {
        credential.validFrom = validFrom;
        credential.validTo = validTo;
        credential.rewritePending = true;
      },
      deferSync,
    );
  }

  /**
   * Empuja el estado deseado a la VPS y anota el resultado. La llamada externa
   * queda fuera de cualquier transacción: si el proceso muere aquí, la fila ya
   * está en `pending` y el barrido de reintentos la recoge.
   */
  async sync(credential: AccessCredential): Promise<AccessCredential> {
    return this.withLock(credential.id, async () =>
      this.syncLocked(
        (await this.credentials.findOne({ where: { id: credential.id } })) ??
          credential,
      ),
    );
  }

  /** Edificios cuyo sitio no está en `ACCESS_SCOPED_SITES`: los barridos los saltan. */
  async frozenBuildingIds(): Promise<number[]> {
    const enabled = this.scopedSites();

    if (enabled.length === 0) {
      return [];
    }

    const sites = await this.catalog.siteIds();

    return [...sites]
      .filter(([, siteId]) => !enabled.includes(siteId))
      .map(([buildingId]) => buildingId);
  }

  /** Si el edificio usa el contrato por scopes. */
  async isScoped(buildingId: number): Promise<boolean> {
    return (await this.siteMode(buildingId)).kind === 'scoped';
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

  /**
   * Cambia el ámbito de una credencial viva **sin tocar el PIN**. El `PUT` solo
   * añade, así que ampliar escribe el scope nuevo y reducir lo retira con un
   * `DELETE`. Repetir un ámbito ya confirmado no genera operaciones.
   */
  async changeScope(
    id: string,
    scope: CredentialScope,
  ): Promise<AccessCredential> {
    const result = await this.mutate(id, async (credential) => {
      if (!LIVE_STATUSES.includes(credential.status)) {
        throw new BadRequestException(
          'Solo se puede cambiar el ámbito de una credencial vigente',
        );
      }

      if (credential.scope === scope) {
        // Si aún no se confirmó, se vuelve a intentar en vez de esperar al barrido.
        return credential.syncState !== 'synced';
      }

      await this.assertScopeAvailable(credential.buildingId, scope);

      // El índice único es por (sujeto, ámbito): si ya hay otra credencial viva
      // con el ámbito destino, mover esta crearía un duplicado.
      const colision = await this.findLive(
        credential.subjectType,
        credential.subjectRef,
        scope,
      );

      if (colision) {
        throw new BadRequestException(
          `El sujeto ya tiene una credencial vigente con ámbito ${scope}`,
        );
      }

      credential.scope = scope;
      credential.syncError = null;
    });

    if (result.syncError === PIN_CONFLICT_ERROR && result.scope !== scope) {
      throw new ConflictException(
        'El PIN coincide con el de otro usuario de esa entrada, así que no se amplió el acceso. Renueva el PIN y vuelve a intentarlo.',
      );
    }

    return result;
  }

  /**
   * Devuelve a la puerta una credencial revocada **con el mismo PIN**. Si la VPS
   * responde `pin_conflict`, `write()` lo rota y el PIN nuevo se reescribe solo en la reserva.
   */
  async reactivate(
    id: string,
    scope: CredentialScope,
    validFrom: Date,
    validTo: Date,
  ): Promise<AccessCredential> {
    return this.mutate(id, async (credential) => {
      if (credential.status !== 'revoked') {
        throw new BadRequestException(
          'Solo se puede reactivar una credencial revocada',
        );
      }

      if (validTo <= new Date()) {
        throw new BadRequestException('La estancia ya terminó');
      }

      await this.assertScopeAvailable(credential.buildingId, scope);

      if (
        await this.findLiveBySubject(
          credential.subjectType,
          credential.subjectRef,
        )
      ) {
        throw new BadRequestException(
          'El sujeto ya tiene una credencial vigente',
        );
      }

      const pinTomado = await this.credentials.count({
        where: {
          buildingId: credential.buildingId,
          pinFingerprint: credential.pinFingerprint,
          status: In(LIVE_STATUSES),
        },
      });

      if (pinTomado > 0) {
        throw new BadRequestException(
          'El PIN ya está asignado a otra credencial del edificio',
        );
      }

      credential.scope = scope;
      credential.validFrom = validFrom;
      credential.validTo = validTo;
      credential.status = 'pending';
      credential.revokedReason = null;
      credential.rewritePending = true;
    });
  }

  /**
   * Renueva el PIN de una credencial viva a petición de un supervisor.
   *
   * Es la contraparte deliberada de `reschedule()` y `changeScope()`, que
   * **nunca** tocan el PIN: aquí cambiarlo es justamente el propósito. El caso
   * real es el huésped que dice que alguien vio su código.
   *
   * `GuestPinNoticeService` reescribe el PIN en la reserva: la huella cambia.
   */
  async regeneratePin(id: string): Promise<AccessCredential> {
    const result = await this.mutate(id, async (credential) => {
      if (!LIVE_STATUSES.includes(credential.status)) {
        throw new BadRequestException(
          'Solo se puede renovar el PIN de una credencial vigente',
        );
      }

      // `rotatePin` respeta la unicidad por edificio y el enfriamiento, porque
      // pasa por el mismo `PinGeneratorService` que la emisión.
      await this.rotatePin(credential);
      credential.rewritePending = true;
    });

    this.logger.log(`PIN renovado para la credencial ${result.id}`);

    return result;
  }

  /**
   * Pedir acceso vehicular en un edificio que solo tiene entrada peatonal es un
   * error del operador, no algo que deba escribirse y fallar en el aparato.
   */
  private async assertScopeAvailable(
    buildingId: number,
    scope: CredentialScope,
  ): Promise<void> {
    if (scope === 'pedestrian') {
      return;
    }

    const building = (await this.catalog.list()).find(
      (item) => item.buildingId === buildingId,
    );

    if (building && !building.scopes.includes('vehicular')) {
      throw new BadRequestException(
        `El edificio ${buildingId} no tiene entrada vehicular`,
      );
    }
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

  /**
   * Igual que `findLive` pero sin fijar el ámbito. Lo usa la emisión automática:
   * si a un huésped le ampliaron el ámbito a mano, buscar solo `pedestrian`
   * devolvería null y se le emitiría un segundo PIN.
   */
  async findLiveBySubject(
    subjectType: SubjectType,
    subjectRef: string,
  ): Promise<AccessCredential | null> {
    return this.credentials.findOne({
      where: { subjectType, subjectRef, status: In(LIVE_STATUSES) },
    });
  }

  /**
   * Todas las credenciales vivas de un huésped, en orden estable. El índice
   * único es por ámbito, así que puede haber más de una a la vez.
   */
  findLiveForGuest(reservationId: string): Promise<AccessCredential[]> {
    return this.credentials.find({
      where: {
        subjectType: 'guest',
        subjectRef: reservationId,
        status: In(LIVE_STATUSES),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /** Único punto del código que revela un PIN. */
  revealPin(credential: AccessCredential): string {
    return this.cipher.decrypt(credential.pinCiphertext);
  }

  /**
   * Serializa por credencial lo que hacen el endpoint, los webhooks y los cron.
   * Candado de sesión porque abarca la llamada a la VPS, que no va en transacción.
   */
  protected async withLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const runner = this.credentials.manager.connection.createQueryRunner();
    const key = `access_credential:${id}`;

    await runner.connect();

    try {
      await runner.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
      return await work();
    } finally {
      try {
        await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
      } finally {
        await runner.release();
      }
    }
  }

  /** Con `deferSync` el empuje corre sin esperarlo; si falla, lo recoge `sync-retry`. */
  private push(
    credential: AccessCredential,
    deferSync = false,
  ): Promise<AccessCredential> {
    if (!deferSync) {
      return this.sync(credential);
    }

    void this.sync(credential).catch((error) =>
      this.logger.warn(
        `Empuje diferido de ${credential.id} fallido: ${this.describe(error)}`,
      ),
    );

    return Promise.resolve(credential);
  }

  /**
   * Aplica `change` bajo el candado de la credencial y la sincroniza. Si
   * `change` devuelve `false` no hay nada que hacer.
   */
  private mutate(
    id: string,
    change: (
      credential: AccessCredential,
    ) => boolean | void | Promise<boolean | void>,
    deferSync = false,
  ): Promise<AccessCredential> {
    return this.withLock(id, async () => {
      const credential = await this.findById(id);

      if ((await change(credential)) === false) {
        return credential;
      }

      credential.syncState = 'pending';
      credential.syncAttempts = 0;
      await this.credentials.save(credential);

      if (!deferSync) {
        return this.syncLocked(credential);
      }

      // Espera al candado, que este `mutate` suelta al volver.
      void this.sync(credential).catch((error) =>
        this.logger.warn(
          `Empuje diferido de ${credential.id} fallido: ${this.describe(error)}`,
        ),
      );

      return credential;
    });
  }

  private async syncLocked(
    credential: AccessCredential,
  ): Promise<AccessCredential> {
    try {
      const mode = await this.siteMode(credential.buildingId);

      if (mode.kind === 'frozen') {
        return await this.freeze(credential);
      }

      return mode.kind === 'scoped'
        ? await this.syncScoped(credential, mode.siteId)
        : await this.syncLegacy(credential);
    } catch (error) {
      credential.syncAttempts += 1;
      credential.syncState = 'pending';
      this.logger.warn(
        `Sincronización fallida de ${credential.id}: ${this.describe(error)}`,
      );
      return this.credentials.save(credential);
    }
  }

  /** Sitio fuera del piloto: queda pendiente, sin gastar intentos, hasta que se habilite. */
  private async freeze(
    credential: AccessCredential,
  ): Promise<AccessCredential> {
    if (
      credential.syncState === 'pending' &&
      credential.syncError === SITE_FROZEN_ERROR
    ) {
      return credential;
    }

    credential.syncState = 'pending';
    credential.syncError = SITE_FROZEN_ERROR;
    return this.credentials.save(credential);
  }

  /** Contrato anterior: el PUT declara el ámbito completo y el DELETE va sin body. */
  private async syncLegacy(
    credential: AccessCredential,
  ): Promise<AccessCredential> {
    const live = LIVE_STATUSES.includes(credential.status);
    const result = live
      ? await this.write(credential, credential.scope)
      : await this.iot.deleteCredential(credential.id);

    credential.syncDetail = result.devices ?? [];
    credential.syncAttempts += 1;
    this.captureEmployeeNo(credential, result);

    if (result.state === 'written') {
      // El PUT solo añade: lo que hubiera antes sigue en la puerta.
      credential.confirmedScopes = live
        ? unionScopes(
            normalizeScopes(credential.confirmedScopes),
            scopesOf(credential.scope),
          )
        : [];
      credential.rewritePending = false;
      this.markSynced(credential);
    } else if (result.state === 'failed') {
      credential.syncState = 'failed';
      credential.syncError = result.errorCode ?? 'failed';
      this.logger.error(
        `Escritura fallida de ${credential.id}: ${result.errorCode ?? 'sin código'}`,
      );
    } else {
      credential.syncState = 'pending';

      // Un `partial` trae código si un aparato falló, y `device_full` no se arregla solo.
      if (result.errorCode) {
        this.logger.warn(
          `Escritura ${result.state} de ${credential.id}: ${result.errorCode}`,
        );
      }
    }

    return this.credentials.save(credential);
  }

  /**
   * Solo las diferencias entre lo deseado y lo confirmado: un `PUT` por lo que
   * falta y un `DELETE` exacto por lo que sobra. Lo confirmado solo cambia con
   * lo que la VPS dio por hecho.
   */
  private async syncScoped(
    credential: AccessCredential,
    siteId: string,
  ): Promise<AccessCredential> {
    const available = (await this.catalog.buildingScopes(
      credential.buildingId,
    )) ?? [...SCOPE_ORDER];
    const live = LIVE_STATUSES.includes(credential.status);
    const desired = (): DeviceScope[] =>
      live ? intersectScopes(scopesOf(credential.scope), available) : [];
    let confirmed = normalizeScopes(credential.confirmedScopes);
    let failed = false;
    let operated = false;
    let leftovers: DeviceScope[] = [];

    const toWrite = credential.rewritePending
      ? desired()
      : subtractScopes(desired(), confirmed);

    if (toWrite.length > 0) {
      // Rotar el PIN solo si nada en la puerta conserva el anterior; si no, se aborta (ampliación o cambio de scope).
      const allowRotate = credential.rewritePending || confirmed.length === 0;
      const result = await this.write(
        credential,
        toWireScope(toWrite)!,
        allowRotate,
      );
      operated = true;
      this.mergeDetail(credential, result.devices);

      if (result.errorCode === 'pin_conflict' && !allowRotate) {
        // Ampliación abortada: vuelve a lo confirmado y retira lo que alcanzó a escribirse.
        this.logger.warn(
          `Ampliación de ${credential.id} abortada por pin_conflict`,
        );
        credential.scope = toWireScope(confirmed) ?? credential.scope;
        credential.syncError = PIN_CONFLICT_ERROR;

        if (result.devices.some((device) => device.state === 'written')) {
          leftovers = toWrite;
        }
      } else {
        confirmed = unionScopes(
          confirmed,
          await this.scopesDone(result, toWrite, 'written'),
        );

        if (!this.captureEmployeeNo(credential, result)) {
          failed = true;
        } else if (result.state === 'failed') {
          failed = true;
          credential.syncError = result.errorCode ?? 'failed';
        } else if (result.state === 'written') {
          credential.rewritePending = false;
        }
      }

      credential.confirmedScopes = confirmed;
      await this.credentials.save(credential);
    }

    const target = desired();
    const toRemove = live
      ? unionScopes(subtractScopes(confirmed, target), leftovers)
      : intersectScopes(
          unionScopes(confirmed, scopesOf(credential.scope)),
          available,
        );
    // No se quita el último acceso que funciona antes de confirmar el nuevo (Peatonal↔Vehicular).
    const keepsAccess =
      !live ||
      leftovers.length > 0 ||
      intersectScopes(confirmed, target).length > 0;

    if (toRemove.length > 0 && keepsAccess) {
      const result = await this.iot.deleteCredential(credential.id, {
        siteId,
        employeeNo:
          credential.employeeNo ??
          deriveEmployeeNo(credential.id, credential.subjectType),
        scopes: toRemove,
      });
      operated = true;
      this.mergeDetail(credential, result.devices);
      confirmed = subtractScopes(
        confirmed,
        await this.scopesDone(result, toRemove, 'deleted'),
      );

      if (result.state === 'failed') {
        failed = true;
        credential.syncError = result.errorCode ?? 'failed';
      }
    }

    if (operated) {
      credential.syncAttempts += 1;
      this.logger.log(
        `Sincronización de ${credential.id}: +[${toWrite.join(',')}] -[${toRemove.join(',')}] confirmado=[${confirmed.join(',')}]`,
      );
    }

    credential.confirmedScopes = confirmed;

    if (failed) {
      credential.syncState = 'failed';
      this.logger.error(
        `Escritura fallida de ${credential.id}: ${credential.syncError ?? 'sin código'}`,
      );
    } else if (sameScopes(confirmed, target) && !credential.rewritePending) {
      this.markSynced(credential);
    } else {
      credential.syncState = 'pending';
    }

    return this.credentials.save(credential);
  }

  /** Con `allowRotate`, un `pin_conflict` regenera el PIN y reintenta; sin él se devuelve tal cual. */
  private async write(
    credential: AccessCredential,
    scope: CredentialScope,
    allowRotate = true,
  ): Promise<CredentialWriteResult> {
    for (let attempt = 1; attempt <= MAX_PIN_CONFLICT_RETRIES; attempt += 1) {
      const result = await this.iot.putCredential(credential.id, {
        buildingId: credential.buildingId,
        scope,
        subjectType: credential.subjectType,
        pin: this.cipher.decrypt(credential.pinCiphertext),
        validFrom: toWireTimestamp(credential.validFrom),
        validTo: toWireTimestamp(credential.validTo),
        displayName: credential.displayName.slice(0, DISPLAY_NAME_MAX),
        unitId: credential.openmaintUnitId,
      });

      // El terminal comparte espacio de PINes con usuarios cargados a mano, que
      // el backend no conoce: la única salida es regenerar y reintentar.
      if (result.errorCode !== 'pin_conflict' || !allowRotate) {
        return result;
      }

      this.logger.warn(
        `PIN en conflicto para ${credential.id}; se regenera (intento ${attempt})`,
      );
      await this.rotatePin(credential);
    }

    return {
      credentialId: credential.id,
      state: 'failed',
      devices: [],
      errorCode: 'pin_conflict',
    };
  }

  private markSynced(credential: AccessCredential): void {
    credential.syncState = 'synced';
    credential.lastSyncedAt = new Date();

    // Un `pin_conflict` de ampliación se conserva para que el CAV vea por qué no se amplió.
    if (credential.syncError !== PIN_CONFLICT_ERROR) {
      credential.syncError = null;
    }

    // `pending` no significa «no funciona»: significa «aún no está en todas
    // las puertas». Solo cuando lo está pasa a activa.
    if (credential.status === 'pending') {
      credential.status = 'active';
    }
  }

  /**
   * Scopes con resultado seguro: todos si el agregado es `written`; en un
   * `partial`, los que tienen todos sus aparatos en el estado esperado.
   */
  private async scopesDone(
    result: CredentialWriteResult,
    requested: DeviceScope[],
    done: 'written' | 'deleted',
  ): Promise<DeviceScope[]> {
    if (result.state === 'written') return requested;
    if (result.state !== 'partial') return [];

    let byDevice: Map<string, DeviceScope>;

    try {
      byDevice = await this.catalog.deviceScopes();
    } catch {
      return [];
    }

    return requested.filter((scope) => {
      const devices = result.devices.filter(
        (device) => byDevice.get(device.deviceId) === scope,
      );

      return (
        devices.length > 0 && devices.every((device) => device.state === done)
      );
    });
  }

  /** Guarda el `employeeNo` del PUT; `false` si los aparatos discrepan o no coincide con el guardado. */
  private captureEmployeeNo(
    credential: AccessCredential,
    result: CredentialWriteResult,
  ): boolean {
    const numbers = new Set(
      result.devices
        .filter((device) => device.state === 'written' && device.employeeNo)
        .map((device) => device.employeeNo!),
    );
    const [employeeNo] = [...numbers];

    if (
      numbers.size > 1 ||
      (employeeNo &&
        credential.employeeNo &&
        employeeNo !== credential.employeeNo)
    ) {
      credential.syncError = 'employee_no_mismatch';
      this.logger.error(
        `employeeNo inconsistente para ${credential.id}: no se confirma`,
      );
      return false;
    }

    if (employeeNo) credential.employeeNo = employeeNo;

    return true;
  }

  /** `sync_detail` por aparato: el PUT de un scope no borra lo anotado de otro. */
  private mergeDetail(
    credential: AccessCredential,
    devices: CredentialDeviceResult[] = [],
  ): void {
    const detail = new Map(
      (credential.syncDetail ?? []).map((entry) => [entry.deviceId, entry]),
    );

    for (const device of devices) {
      if (device.state === 'deleted') {
        detail.delete(device.deviceId);
      } else {
        detail.set(device.deviceId, device);
      }
    }

    credential.syncDetail = [...detail.values()];
  }

  private scopedSites(): string[] {
    return (this.config.get<string>('ACCESS_SCOPED_SITES') ?? '')
      .split(',')
      .map((site) => site.trim().toLowerCase())
      .filter(Boolean);
  }

  private async siteMode(buildingId: number): Promise<SiteMode> {
    const enabled = this.scopedSites();

    if (enabled.length === 0) {
      return { kind: 'legacy' };
    }

    const siteId = await this.catalog.siteIdOf(buildingId);

    return siteId && enabled.includes(siteId)
      ? { kind: 'scoped', siteId }
      : { kind: 'frozen' };
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
        confirmedScopes: [],
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

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
