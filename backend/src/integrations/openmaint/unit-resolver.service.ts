import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintServiceSession } from './openmaint.service-session';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Por llamada; el webhook de Hostaway corta a los 20 s y aquí hay dos. */
const LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Atributo de `Unit` que guarda el `listingMapId` de Hostaway. Verificado
 * contra `GET /classes/Unit/attributes`: la `D` final va en mayúscula, y el
 * filtro de CMDBuild distingue mayúsculas.
 */
const LISTING_ATTRIBUTE = 'HostawayListingID';

export interface UnitLocation {
  unitId: number;
  /** Nulo si la unidad existe pero no tiene edificio asignado. */
  buildingId: number | null;
}

interface UnitCard {
  _id: number;
  Building?: number | null;
}

interface UnitCardsResponse {
  data?: UnitCard[];
}

/**
 * Resuelve `listingMapId` → unidad y edificio de openMAINT. Lo que consume el
 * control de accesos es el edificio; la unidad viaja de paso, como contexto.
 */
@Injectable()
export class UnitResolverService {
  private readonly logger = new Logger(UnitResolverService.name);

  /** Solo se cachean respuestas definitivas: un fallo de red no envenena la caché. */
  private readonly cache = new Map<
    string,
    { value: UnitLocation | null; cachedAt: number }
  >();

  constructor(
    private readonly client: OpenmaintClient,
    private readonly serviceSession: OpenmaintServiceSession,
  ) {}

  /** `null` es definitivo (sin mapear o ambiguo); un fallo de openMAINT se propaga. */
  async byListingId(listingId: string): Promise<UnitLocation | null> {
    const key = (listingId ?? '').trim();

    if (!key) {
      return null;
    }

    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.value;
    }

    const value = await this.lookup(key);
    this.cache.set(key, { value, cachedAt: Date.now() });
    this.evictExpired();
    return value;
  }

  forget(listingId: string): void {
    this.cache.delete((listingId ?? '').trim());
  }

  private async lookup(listingId: string): Promise<UnitLocation | null> {
    const sessionId = await this.serviceSession.get({
      timeout: LOOKUP_TIMEOUT_MS,
    });
    const filter = encodeURIComponent(
      JSON.stringify({
        attribute: {
          simple: {
            attribute: LISTING_ATTRIBUTE,
            operator: 'equal',
            value: listingId,
          },
        },
      }),
    );

    const response = (await this.client.get(
      `/classes/Unit/cards?limit=500&filter=${filter}`,
      sessionId,
      { timeout: LOOKUP_TIMEOUT_MS },
    )) as UnitCardsResponse;

    const cards = response?.data ?? [];

    if (cards.length === 0) {
      this.logger.warn(
        `El listing ${listingId} no está mapeado a ninguna unidad de openMAINT`,
      );
      return null;
    }

    // Ambiguo es peor que ausente: colocar una credencial en el edificio
    // equivocado abre una puerta que no toca. Ante duda, no se resuelve.
    if (cards.length > 1) {
      this.logger.error(
        `El listing ${listingId} apunta a ${cards.length} unidades; corregir el dato en openMAINT`,
      );
      return null;
    }

    const card = cards[0];

    return {
      unitId: card._id,
      buildingId: typeof card.Building === 'number' ? card.Building : null,
    };
  }

  private evictExpired(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache) {
      if (now - entry.cachedAt >= CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
