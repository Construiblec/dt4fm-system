import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { BuildingCatalogService } from './building-catalog.service';
import { CredentialService } from './credential.service';
import {
  AccessCredential,
  CredentialScope,
} from './entities/access-credential.entity';
import { GuestStay } from './entities/guest-stay.entity';

/** Tope defensivo: la pantalla filtra por rango, no pagina. */
const MAX_RESULTS = 200;

const UNIT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Lo que ve el supervisor de CAV. **Nunca incluye el PIN.** */
export interface AuthorizationView {
  /** `guest_stay.id`. Es un uuid, no el id de la reserva en Hostaway. */
  id: string;
  guestName: string;
  /** "Pradera · UI R302", ya compuesto aquí para que el frontend no ensamble. */
  unitLabel: string;
  /** Inicio de la ventana de acceso, ISO. */
  checkIn: string;
  /** Fin de la ventana: es el "válido hasta" que muestra la pantalla, ISO. */
  checkOut: string;
  accessLevel: CredentialScope;
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
    const conCredencial = stays.filter((stay) =>
      porReserva.has(stay.hostawayReservationId),
    );

    const etiquetas = await this.labelsFor(conCredencial, sessionId);

    return conCredencial.map((stay) =>
      this.toView(
        stay,
        porReserva.get(stay.hostawayReservationId)!,
        etiquetas.get(stay.id) ?? '',
      ),
    );
  }

  async detail(stayId: string, sessionId: string): Promise<AuthorizationView> {
    const { stay, credential } = await this.resolve(stayId);
    const etiquetas = await this.labelsFor([stay], sessionId);

    return this.toView(stay, credential, etiquetas.get(stay.id) ?? '');
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  /**
   * Renueva el PIN. No devuelve el código: el supervisor solo necesita saber
   * que se hizo, y el huésped lo ve en su portal en la siguiente visita.
   */
  async regenerate(
    stayId: string,
    sessionId: string,
  ): Promise<AuthorizationView> {
    const { stay, credential } = await this.resolve(stayId);

    await this.credentialService.regeneratePin(credential.id);

    this.logger.log(
      `PIN renovado desde Autorizaciones para la estancia ${stay.id}`,
    );

    return this.detail(stayId, sessionId);
  }

  async changeAccessLevel(
    stayId: string,
    accessLevel: CredentialScope,
    sessionId: string,
  ): Promise<AuthorizationView> {
    const { credential } = await this.resolve(stayId);

    await this.credentialService.changeScope(credential.id, accessLevel);

    return this.detail(stayId, sessionId);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  /**
   * Estancia + su credencial viva. Que falte la credencial no es un error del
   * sistema: es un edificio sin control de accesos, y para esta pantalla
   * equivale a que la autorización no exista.
   */
  private async resolve(
    stayId: string,
  ): Promise<{ stay: GuestStay; credential: AccessCredential }> {
    const stay = await this.stays.findOne({ where: { id: stayId } });

    if (!stay) {
      throw new NotFoundException('La autorización no existe');
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

  private arrivalFilter(from?: string, to?: string) {
    if (from && to) return { arrivalDate: Between(from, to) };
    if (from) return { arrivalDate: MoreThanOrEqual(from) };
    if (to) return { arrivalDate: LessThanOrEqual(to) };

    return {};
  }

  private toView(
    stay: GuestStay,
    credential: AccessCredential,
    unitLabel: string,
  ): AuthorizationView {
    return {
      id: stay.id,
      guestName: stay.guestName,
      unitLabel,
      checkIn: stay.accessValidFrom.toISOString(),
      checkOut: stay.accessValidTo.toISOString(),
      accessLevel: credential.scope,
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
