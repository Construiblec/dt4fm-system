import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';

export interface GuestLocation {
  unitName: string | null;
  buildingName: string | null;
  buildingAddress: string | null;
}

interface UnitCard {
  Code?: string | null;
  Name?: string | null;
  Description?: string | null;
  _Building_description?: string | null;
}

interface BuildingCard {
  Name?: string | null;
  Description?: string | null;
  Address?: string | null;
  City?: string | null;
}

const EMPTY: GuestLocation = {
  unitName: null,
  buildingName: null,
  buildingAddress: null,
};

const TIMEOUT_MS = 4_000;
// Los nombres y direcciones casi nunca cambian; un fallo se reintenta pronto.
const SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Nombre de la unidad, del edificio y dirección para el portal del huésped.
 *
 * Se consulta al leer y no se guarda en `guest_stay`: lo que se corrija en
 * openMAINT aparece sin re-proyectar. **Nunca lanza**: sin openMAINT el portal
 * sigue funcionando, solo sin estos textos.
 */
@Injectable()
export class GuestLocationService {
  private readonly logger = new Logger(GuestLocationService.name);
  private readonly cache = new Map<
    string,
    { value: GuestLocation; expiresAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<GuestLocation>>();

  constructor(
    private readonly client: OpenmaintClient,
    private readonly serviceSession: OpenmaintServiceSession,
  ) {}

  lookup(
    unitId: number | null,
    buildingId: number | null,
  ): Promise<GuestLocation> {
    if (unitId === null && buildingId === null) {
      return Promise.resolve(EMPTY);
    }

    const key = `${unitId ?? '-'}:${buildingId ?? '-'}`;
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }

    // Varias visitas simultáneas comparten una sola consulta.
    const pending = this.inFlight.get(key);

    if (pending) return pending;

    const request = this.fetch(unitId, buildingId)
      .then(({ value, ok }) => {
        this.evictExpired();
        this.cache.set(key, {
          value,
          expiresAt: Date.now() + (ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS),
        });
        return value;
      })
      .finally(() => this.inFlight.delete(key));

    this.inFlight.set(key, request);

    return request;
  }

  private async fetch(
    unitId: number | null,
    buildingId: number | null,
  ): Promise<{ value: GuestLocation; ok: boolean }> {
    try {
      const sessionId = await this.serviceSession.get({ timeout: TIMEOUT_MS });

      const [unit, building] = await Promise.all([
        unitId !== null
          ? this.card<UnitCard>(`/classes/Unit/cards/${unitId}`, sessionId)
          : null,
        buildingId !== null
          ? this.card<BuildingCard>(
              `/classes/Building/cards/${buildingId}`,
              sessionId,
            )
          : null,
      ]);

      const address = [text(building?.Address), text(building?.City)]
        .filter(Boolean)
        .join(', ');

      return {
        ok: true,
        value: {
          unitName:
            text(unit?.Code) ?? text(unit?.Name) ?? text(unit?.Description),
          buildingName:
            text(building?.Name) ??
            text(unit?._Building_description) ??
            text(building?.Description),
          buildingAddress: address || null,
        },
      };
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la ubicación (unidad ${unitId}, edificio ${buildingId}) de openMAINT: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ok: false, value: EMPTY };
    }
  }

  private async card<T>(path: string, sessionId: string): Promise<T | null> {
    const response = (await this.client.get(path, sessionId, {
      timeout: TIMEOUT_MS,
    })) as { data?: T } | null;

    return response?.data ?? null;
  }

  private evictExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
  }
}
