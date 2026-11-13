import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import type { DeviceScope } from './access-iot.types';
import { BuildingCatalogService } from './building-catalog.service';
import { normalizeScopes, scopesOf, toWireScope } from './credential-scopes';
import { CredentialService } from './credential.service';
import {
  AccessCredential,
  CredentialScope,
} from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';
import { graceHours, leadHours } from './guest-stay-timing';
import {
  GuestPinNoticeService,
  PinNoticeResult,
  PinNoticeView,
} from './guest-pin-notice.service';

/** Tope defensivo: la pantalla filtra por rango, no pagina. */
const MAX_RESULTS = 200;

const UNIT_CACHE_TTL_MS = 5 * 60 * 1000;

/** `revoked_reason` de las credenciales que el CAV retira desde Autorizaciones. */
export const CAV_SUSPENDED_REASON = 'cav_suspended';

/** Lo que acepta «Cambiar nivel de accesos»: `none` revoca todas las puertas. */
export type AccessLevelChoice = CredentialScope | 'none';

/** `accessScopes` (estado final) o el `accessLevel` anterior; exactamente uno. */
export const accessLevelOf = (dto: {
  accessScopes?: DeviceScope[];
  accessLevel?: AccessLevelChoice;
}): AccessLevelChoice => {
  if ((dto.accessScopes === undefined) === (dto.accessLevel === undefined)) {
    throw new BadRequestException('Envía accessScopes o accessLevel, no ambos');
  }

  return dto.accessScopes
    ? (toWireScope(dto.accessScopes) ?? 'none')
    : dto.accessLevel!;
};

/** `confirmed`: la puerta ya refleja lo pedido. `pending`/`failed`: todavía no. */
export type AccessSyncStatus = 'confirmed' | 'pending' | 'failed';

const NOT_APPLICABLE: PinNoticeView = {
  status: 'not_applicable',
  at: null,
  error: null,
  renewalMessage: false,
};

/** Lo que ve el supervisor de CAV. **Nunca incluye el PIN.** */
export interface AuthorizationView {
  /** `guest_stay.id`. Es un uuid, no el id de la reserva en Hostaway. */
  id: string;
  guestName: string;
  /** "Pradera · UI R302", ya compuesto aquí para que el frontend no ensamble. */
  unitLabel: string;
  /** Check-in y check-out de la reserva, ISO. */
  checkIn: string;
  checkOut: string;
  /** Vigencia del PIN (la reserva con los márgenes), ISO. */
  pinValidFrom: string;
  pinValidTo: string;
  /** `null` si el CAV revocó el acceso. */
  accessLevel: CredentialScope | null;
  /** Lo pedido; `[]` si el CAV revocó el acceso. */
  desiredScopes: DeviceScope[];
  /** Lo que la VPS confirmó en las puertas. */
  confirmedScopes: DeviceScope[];
  syncStatus: AccessSyncStatus;
  /** Código del último fallo (`pin_conflict`, `site_frozen`…), sin detalle de la VPS. */
  syncError: string | null;
  accessRevoked: { at: string; by: string | null } | null;
  /** Si el PIN quedó escrito en la reserva de Hostaway (`doorCode`). */
  pinNotice: PinNoticeView;
}

type OpenmaintUnitCard = {
  _id: number;
  Code?: string | null;
  Name?: string | null;
  Description?: string | null;
};

type OpenmaintUnitsResponse = { data?: OpenmaintUnitCard[] };

/**
 * Sirve la pantalla de Autorizaciones del Supervisor CAV.
 *
 * Una "autorización" es una estancia **que tiene credencial viva**. Esa unión
 * no es un detalle de implementación: es lo que deja fuera, sin filtro extra, a
 * los edificios sin lector de PIN —Batán y Republica no llegan a tener
 * credencial nunca—, que es justo lo que este rol no puede accionar.
 */
@Injectable()
export class AuthorizationsService {
  private readonly logger = new Logger(AuthorizationsService.name);

  /** Unidades por edificio: una llamada a openMAINT por edificio, no por fila. */
  private readonly unitCache = new Map<
    number,
    { labels: Map<number, string>; cachedAt: number }
  >();

  constructor(
    @InjectRepository(GuestStay)
    private readonly stays: Repository<GuestStay>,
    @InjectRepository(AccessCredential)
    private readonly credentials: Repository<AccessCredential>,
    private readonly credentialService: CredentialService,
    private readonly catalog: BuildingCatalogService,
    private readonly openmaint: OpenmaintService,
    private readonly pinNotice: GuestPinNoticeService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Fuerza a releer las unidades en la próxima consulta. Mismo motivo que el
   * `invalidate()` del catálogo de edificios: sin esto, una caché de cinco
   * minutos sobrevive entre pruebas y entre cambios hechos en openMAINT.
   */
  invalidate(): void {
    this.unitCache.clear();
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  async list(
    from: string | undefined,
    to: string | undefined,
    sessionId: string,
  ): Promise<AuthorizationView[]> {
    const stays = await this.stays.find({
      where: {
        ...this.arrivalFilter(from, to),
        status: In(['pending', 'active']),
      },
      order: { accessValidFrom: 'ASC' },
      take: MAX_RESULTS,
    });

    if (stays.length === 0) {
      return [];
    }

    // Una sola consulta para todas las credenciales, en vez de una por fila.
    const vivas = await this.credentials.find({
      where: {
        subjectType: 'guest',
        subjectRef: In(stays.map((stay) => stay.hostawayReservationId)),
        status: In(['pending', 'active']),
      },
    });

    const porReserva = new Map(vivas.map((c) => [c.subjectRef, c]));
    const suspendidas = await this.suspendedFor(
      stays.filter((stay) => stay.accessSuspendedAt),
    );
    // Las revocadas por el CAV siguen en la lista para poder restaurarlas.
    const visibles = stays.filter(
      (stay) =>
        stay.accessSuspendedAt || porReserva.has(stay.hostawayReservationId),
    );

    const etiquetas = await this.labelsFor(visibles, sessionId);
    const pares = visibles
      .filter((stay) => !stay.accessSuspendedAt)
      .map((stay) => ({
        stay,
        credential: porReserva.get(stay.hostawayReservationId)!,
      }));
    const avisos = await this.pinNotice.statusFor(pares);

    return visibles.map((stay) =>
      this.toView(
        stay,
        stay.accessSuspendedAt
          ? (suspendidas.get(stay.hostawayReservationId) ?? null)
          : porReserva.get(stay.hostawayReservationId)!,
        etiquetas.get(stay.id) ?? '',
        avisos.get(stay.id) ?? NOT_APPLICABLE,
      ),
    );
  }

  async detail(stayId: string, sessionId: string): Promise<AuthorizationView> {
    const { stay, credential } = await this.resolve(stayId);
    const etiquetas = await this.labelsFor([stay], sessionId);
    const avisos = credential
      ? await this.pinNotice.statusFor([{ stay, credential }])
      : new Map<string, PinNoticeView>();

    return this.toView(
      stay,
      credential ?? (await this.lastSuspended(stay)),
      etiquetas.get(stay.id) ?? '',
      avisos.get(stay.id) ?? NOT_APPLICABLE,
    );
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /** Renueva el PIN, lo escribe en la reserva y avisa del nuevo por el chat. Nunca devuelve el código. */
  async regenerate(
    stayId: string,
    sessionId: string,
  ): Promise<AuthorizationView> {
    const { stay, credential } = this.requireLive(await this.resolve(stayId));

    await this.credentialService.regeneratePin(credential.id);

    this.logger.log(
      `PIN renovado desde Autorizaciones para la estancia ${stay.id}`,
    );

    await this.pinNotice.requestRenewalMessage(stay, credential);
    await this.pinNotice.notify(stay.id);

    return this.detail(stayId, sessionId);
  }

  /** Vuelve a escribir el PIN en la reserva de Hostaway aunque ya estuviera escrito. */
  async resendPinNotice(stayId: string): Promise<PinNoticeResult> {
    const { stay } = this.requireLive(await this.resolve(stayId));

    return this.pinNotice.notify(stay.id, { force: true });
  }

  /**
   * `none` revoca todas las puertas y marca la estancia para que Hostaway no la
   * reemita. Un nivel sobre una estancia revocada la restaura con el mismo PIN.
   */
  async changeAccessLevel(
    stayId: string,
    accessLevel: AccessLevelChoice,
    sessionId: string,
    username: string | null = null,
  ): Promise<AuthorizationView> {
    const { stay, credential } = await this.resolve(stayId);

    if (accessLevel === 'none') {
      if (!stay.accessSuspendedAt) {
        // La marca va antes del DELETE: un webhook en medio no debe reemitir.
        stay.accessSuspendedAt = new Date();
        stay.accessSuspendedBy = username;
        await this.stays.save(stay);
      }

      for (const viva of await this.credentialService.findLiveForGuest(
        stay.hostawayReservationId,
      )) {
        await this.credentialService.revoke(viva.id, CAV_SUSPENDED_REASON);
      }

      this.logger.log(`Acceso revocado por el CAV en la estancia ${stay.id}`);
    } else if (!credential) {
      const revocada = await this.lastSuspended(stay);

      if (!revocada) {
        throw new NotFoundException('No hay credencial que restaurar');
      }

      await this.credentialService.reactivate(
        revocada.id,
        accessLevel,
        stay.accessValidFrom,
        stay.accessValidTo,
      );

      stay.accessSuspendedAt = null;
      stay.accessSuspendedBy = null;
      await this.stays.save(stay);

      this.logger.log(`Acceso restaurado por el CAV en la estancia ${stay.id}`);
    } else {
      await this.credentialService.changeScope(credential.id, accessLevel);
    }

    return this.detail(stayId, sessionId);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  /**
   * Estancia + su credencial viva, o `null` si el CAV la revocó. Sin credencial
   * ni revocación es un edificio sin control de accesos: para esta pantalla, 404.
   */
  private async resolve(
    stayId: string,
  ): Promise<{ stay: GuestStay; credential: AccessCredential | null }> {
    const stay = await this.stays.findOne({ where: { id: stayId } });

    if (!stay) {
      throw new NotFoundException('La autorización no existe');
    }

    if (stay.accessSuspendedAt) {
      return { stay, credential: null };
    }

    const credential = await this.credentialService.findLiveBySubject(
      'guest',
      stay.hostawayReservationId,
    );

    if (!credential) {
      throw new NotFoundException(
        'La estancia no tiene una credencial vigente',
      );
    }

    return { stay, credential };
  }

  /** Las estancias anteriores a `check_in_at` la deducen quitando los márgenes actuales. */
  private checkTimes(stay: GuestStay): { checkIn: Date; checkOut: Date } {
    const hour = 60 * 60 * 1000;

    return {
      checkIn:
        stay.checkInAt ??
        new Date(
          stay.accessValidFrom.getTime() + leadHours(this.config) * hour,
        ),
      checkOut:
        stay.checkOutAt ??
        new Date(stay.accessValidTo.getTime() - graceHours(this.config) * hour),
    };
  }

  private requireLive(resolved: {
    stay: GuestStay;
    credential: AccessCredential | null;
  }): { stay: GuestStay; credential: AccessCredential } {
    if (!resolved.credential) {
      throw new BadRequestException('El acceso está revocado');
    }

    return { stay: resolved.stay, credential: resolved.credential };
  }

  /** La credencial que el CAV retiró de cada estancia revocada: dice si el DELETE ya llegó. */
  private async suspendedFor(
    stays: GuestStay[],
  ): Promise<Map<string, AccessCredential>> {
    if (stays.length === 0) {
      return new Map();
    }

    const filas = await this.credentials.find({
      where: {
        subjectType: 'guest',
        subjectRef: In(stays.map((stay) => stay.hostawayReservationId)),
        status: 'revoked',
        revokedReason: CAV_SUSPENDED_REASON,
      },
      order: { updatedAt: 'DESC' },
    });
    const porReserva = new Map<string, AccessCredential>();

    for (const fila of filas) {
      if (!porReserva.has(fila.subjectRef))
        porReserva.set(fila.subjectRef, fila);
    }

    return porReserva;
  }

  private lastSuspended(stay: GuestStay): Promise<AccessCredential | null> {
    return this.credentials.findOne({
      where: {
        subjectType: 'guest',
        subjectRef: stay.hostawayReservationId,
        status: 'revoked',
        revokedReason: CAV_SUSPENDED_REASON,
      },
      order: { updatedAt: 'DESC' },
    });
  }

  private arrivalFilter(from?: string, to?: string) {
    if (from && to) return { arrivalDate: Between(from, to) };
    if (from) return { arrivalDate: MoreThanOrEqual(from) };
    if (to) return { arrivalDate: LessThanOrEqual(to) };

    return {};
  }

  private toView(
    stay: GuestStay,
    credential: AccessCredential | null,
    unitLabel: string,
    pinNotice: PinNoticeView,
  ): AuthorizationView {
    return {
      id: stay.id,
      guestName: stay.guestName,
      unitLabel,
      checkIn: this.checkTimes(stay).checkIn.toISOString(),
      checkOut: this.checkTimes(stay).checkOut.toISOString(),
      pinValidFrom: stay.accessValidFrom.toISOString(),
      pinValidTo: stay.accessValidTo.toISOString(),
      accessLevel: stay.accessSuspendedAt ? null : (credential?.scope ?? null),
      desiredScopes:
        stay.accessSuspendedAt || !credential ? [] : scopesOf(credential.scope),
      confirmedScopes: normalizeScopes(credential?.confirmedScopes),
      syncStatus: !credential
        ? 'confirmed'
        : credential.syncState === 'synced'
          ? 'confirmed'
          : credential.syncState,
      syncError: credential?.syncError ?? null,
      accessRevoked: stay.accessSuspendedAt
        ? {
            at: stay.accessSuspendedAt.toISOString(),
            by: stay.accessSuspendedBy,
          }
        : null,
      pinNotice,
    };
  }

  /**
   * Compone "edificio · unidad" para cada estancia.
   *
   * El nombre del edificio sale del catálogo de la VPS, que ya viene cacheado;
   * el de la unidad, de openMAINT. Se agrupa por edificio para no pagar una
   * llamada por fila, y si openMAINT no responde se degrada al nombre del
   * edificio en vez de romper la pantalla entera.
   */
  private async labelsFor(
    stays: GuestStay[],
    sessionId: string,
  ): Promise<Map<string, string>> {
    const edificios = await this.buildingNames();
    const buildingIds = [
      ...new Set(
        stays
          .map((stay) => stay.buildingId)
          .filter((id): id is number => id !== null),
      ),
    ];

    const unidades = new Map<number, string>();

    for (const buildingId of buildingIds) {
      for (const [unitId, label] of await this.unitsOf(buildingId, sessionId)) {
        unidades.set(unitId, label);
      }
    }

    return new Map(
      stays.map((stay) => {
        const edificio =
          stay.buildingId !== null
            ? (edificios.get(stay.buildingId) ?? `Edificio ${stay.buildingId}`)
            : null;
        const unidad =
          stay.openmaintUnitId !== null
            ? unidades.get(stay.openmaintUnitId)
            : undefined;

        return [stay.id, [edificio, unidad].filter(Boolean).join(' · ')];
      }),
    );
  }

  private async buildingNames(): Promise<Map<number, string>> {
    try {
      const edificios = await this.catalog.list();

      return new Map(edificios.map((b) => [b.buildingId, b.name]));
    } catch (error) {
      this.logger.warn(
        `No se pudo leer el catálogo de edificios: ${this.describe(error)}`,
      );
      return new Map();
    }
  }

  private async unitsOf(
    buildingId: number,
    sessionId: string,
  ): Promise<Map<number, string>> {
    const cached = this.unitCache.get(buildingId);

    if (cached && Date.now() - cached.cachedAt < UNIT_CACHE_TTL_MS) {
      return cached.labels;
    }

    try {
      const response = (await this.openmaint.getUnitsByBuilding(
        buildingId,
        sessionId,
      )) as OpenmaintUnitsResponse;

      const labels = new Map(
        (response?.data ?? []).map((card) => [card._id, this.labelOf(card)]),
      );

      this.unitCache.set(buildingId, { labels, cachedAt: Date.now() });

      return labels;
    } catch (error) {
      this.logger.warn(
        `No se pudieron leer las unidades del edificio ${buildingId}: ${this.describe(error)}`,
      );
      return new Map();
    }
  }

  /** Misma regla que `BuildingsService.resolveLabel`, para no discrepar. */
  private labelOf(card: OpenmaintUnitCard): string {
    return (
      card.Description?.trim() ||
      card.Name?.trim() ||
      card.Code?.trim() ||
      String(card._id)
    );
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
