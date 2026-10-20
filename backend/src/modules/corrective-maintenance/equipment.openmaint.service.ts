import { Injectable } from '@nestjs/common';
import type {
  DownloadedFile,
  RawOpenmaintAttachment,
} from '../../common/utils/openmaint-attachment.util';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';

/** Tarjeta de la superclase `Asset`, que cubre todas las clases de equipo. */
export type EquipmentCard = {
  _id: number;
  _type?: string | null;
  Code?: string | null;
  Description?: string | null;
  CISubset?: number | null;
  Building?: number | null;
  _Building_description?: string | null;
  _Floor_description?: string | null;
};

type CardsResponse<T> = { data?: T[]; meta?: { total?: number } };
type AttachmentsResponse = { data?: RawOpenmaintAttachment[] };

const ASSETS_PATH = '/classes/Asset/cards';
const PREV_MAINT_CONFIG_PATH = '/classes/PrevMaintConfig/cards';
const MANUAL_PATH = '/classes/MaintenanceManual/cards';

/**
 * Equipo intervenido y su documentación. Los PDFs pueden colgar de la propia
 * tarjeta del equipo o del manual al que apunta un plan preventivo de su subconjunto.
 */
@Injectable()
export class EquipmentOpenmaintService {
  constructor(private readonly client: OpenmaintClient) {}

  async findById(sessionId: string, id: number): Promise<EquipmentCard | null> {
    const response = (await this.client.get(
      `${ASSETS_PATH}/${id}`,
      sessionId,
    )) as { data?: EquipmentCard };

    return response.data ?? null;
  }

  /** Búsqueda libre por código o descripción, acotada al edificio si se indica. */
  async search(
    sessionId: string,
    {
      query,
      buildingId,
      limit,
    }: { query?: string; buildingId?: number | null; limit: number },
  ): Promise<EquipmentCard[]> {
    const filter: Record<string, unknown> = {};

    if (query?.trim()) {
      filter.query = query.trim();
    }

    if (buildingId != null) {
      filter.attribute = {
        simple: {
          attribute: 'Building',
          operator: 'equal',
          value: [String(buildingId)],
        },
      };
    }

    const params = new URLSearchParams({
      limit: String(limit),
      sort: JSON.stringify([{ property: 'Code', direction: 'ASC' }]),
      filter: JSON.stringify(filter),
    });

    const response = (await this.client.get(
      `${ASSETS_PATH}?${params.toString()}`,
      sessionId,
    )) as CardsResponse<EquipmentCard>;

    return response.data ?? [];
  }

  async findAttachments(
    sessionId: string,
    equipment: { _id: number; _type?: string | null },
  ): Promise<RawOpenmaintAttachment[]> {
    const response = (await this.client.get(
      `/classes/${equipment._type ?? 'Asset'}/cards/${equipment._id}/attachments`,
      sessionId,
    )) as AttachmentsResponse;

    return response.data ?? [];
  }

  async downloadAttachment(
    sessionId: string,
    equipment: { _id: number; _type?: string | null },
    attachmentId: string,
  ): Promise<DownloadedFile> {
    return this.client.getBuffer(
      `/classes/${equipment._type ?? 'Asset'}/cards/${equipment._id}/attachments/${attachmentId}/download`,
      sessionId,
    );
  }

  /** Manuales de los planes preventivos definidos para el subconjunto del equipo. */
  async findManualIdsBySubset(
    sessionId: string,
    subsetId: number,
  ): Promise<number[]> {
    const params = new URLSearchParams({
      limit: '20',
      filter: JSON.stringify({
        attribute: {
          simple: {
            attribute: 'CISubset',
            operator: 'equal',
            value: [String(subsetId)],
          },
        },
      }),
    });

    const response = (await this.client.get(
      `${PREV_MAINT_CONFIG_PATH}?${params.toString()}`,
      sessionId,
    )) as CardsResponse<{ MaintManual?: number | null }>;

    const ids = (response.data ?? [])
      .map((config) => config.MaintManual)
      .filter((id): id is number => id != null);

    return [...new Set(ids)];
  }

  async findManualAttachments(
    sessionId: string,
    manualId: number,
  ): Promise<RawOpenmaintAttachment[]> {
    const response = (await this.client.get(
      `${MANUAL_PATH}/${manualId}/attachments`,
      sessionId,
    )) as AttachmentsResponse;

    return response.data ?? [];
  }

  async downloadManualAttachment(
    sessionId: string,
    manualId: number,
    attachmentId: string,
  ): Promise<DownloadedFile> {
    return this.client.getBuffer(
      `${MANUAL_PATH}/${manualId}/attachments/${attachmentId}/download`,
      sessionId,
    );
  }
}
