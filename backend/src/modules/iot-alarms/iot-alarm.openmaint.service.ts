import { Injectable, Logger } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';

/**
 * Tarjeta de la superclase `Asset`. Los atributos con prefijo `_` son las
 * descripciones resueltas de las referencias; el que no lo lleva es el ID.
 */
export type AssetCard = {
  _id: number;
  _type?: string | null;
  Code?: string | null;
  Description?: string | null;
  Building?: number | null;
  _Building_description?: string | null;
  Floor?: number | null;
  _Floor_description?: string | null;
};

/**
 * `Code` no es único en el esquema de `Asset` (`unique=false`), y de hecho hoy
 * hay códigos repetidos en la instancia. Por eso la búsqueda distingue los tres
 * desenlaces en vez de devolver una tarjeta o nada.
 */
export type AssetLookup =
  | { outcome: 'found'; asset: AssetCard }
  | { outcome: 'missing' }
  | { outcome: 'ambiguous'; candidateIds: number[] };

export type CreatedCorrective = {
  id: number;
  number: string | null;
};

type AssetCardsResponse = { data?: AssetCard[] };

type CreateInstanceResponse = {
  success?: boolean;
  data?: { _id?: number; Number?: string | null };
};

const ASSETS_PATH = '/classes/Asset/cards';
const INSTANCES_PATH = '/processes/CorrectiveMaint/instances';
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Gateway hacia openMAINT para el flujo de alarmas IoT: resolver el activo que
 * la originó y abrir el correctivo.
 */
@Injectable()
export class IotAlarmOpenmaintService {
  private readonly logger = new Logger(IotAlarmOpenmaintService.name);
  private readonly cache = new Map<string, { asset: AssetCard; at: number }>();

  constructor(private readonly client: OpenmaintClient) {}

  /**
   * Activo por `Code`, consultando la **superclase** `Asset`: una sola llamada
   * cubre las 80+ subclases concretas y devuelve además la ubicación, que es de
   * donde sale el `Site` obligatorio del correctivo.
   */
  async findAssetByCode(sessionId: string, code: string): Promise<AssetLookup> {
    const cached = this.readCache(code);

    if (cached) {
      return { outcome: 'found', asset: cached };
    }

    // limit=3 basta para distinguir único / ausente / ambiguo.
    const params = new URLSearchParams({
      limit: '3',
      filter: JSON.stringify({
        attribute: {
          simple: { attribute: 'Code', operator: 'equal', value: [code] },
        },
      }),
    });

    const response = (await this.client.get(
      `${ASSETS_PATH}?${params.toString()}`,
      sessionId,
    )) as AssetCardsResponse;

    const cards = response.data ?? [];

    if (cards.length === 0) {
      this.logger.warn(`No existe ningún activo con el código "${code}"`);
      return { outcome: 'missing' };
    }

    if (cards.length > 1) {
      const candidateIds = cards.map((card) => card._id);
      this.logger.error(
        `Código "${code}" ambiguo: ${candidateIds.length} activos coinciden (${candidateIds.join(', ')})`,
      );
      return { outcome: 'ambiguous', candidateIds };
    }

    // Solo se cachea el acierto: guardar un fallo taparía la corrección del dato.
    this.writeCache(code, cards[0]);

    return { outcome: 'found', asset: cards[0] };
  }

  /** Abre el correctivo en `CM01-Opening` y lo avanza a Asignación. */
  async createCorrective(
    sessionId: string,
    fields: Record<string, unknown>,
  ): Promise<CreatedCorrective> {
    const response = (await this.client.post(
      INSTANCES_PATH,
      {
        _type: 'CorrectiveMaint',
        _activity: 'CM01-Opening',
        _advance: true,
        ...fields,
      },
      sessionId,
    )) as CreateInstanceResponse;

    const id = response.data?._id;

    if (response.success === false || !id) {
      throw new Error('openMAINT no devolvió el identificador del correctivo');
    }

    return { id, number: response.data?.Number ?? null };
  }

  private readCache(code: string): AssetCard | null {
    const entry = this.cache.get(code);

    if (!entry) {
      return null;
    }

    // Con TTL para que mover un equipo de piso no quede congelado en memoria.
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      this.cache.delete(code);
      return null;
    }

    return entry.asset;
  }

  private writeCache(code: string, asset: AssetCard): void {
    this.cache.set(code, { asset, at: Date.now() });
  }
}
