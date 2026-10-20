import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  DownloadedFile,
  getHttpErrorStatus,
  isGeneratedReport,
  MaintenanceAttachment,
  RawOpenmaintAttachment,
  sendDownloadedFile,
  toMaintenanceAttachment,
} from '../../common/utils/openmaint-attachment.util';
import { CM_STATUS_IDS } from '../maintenance-supervision/constants/corrective-maint.constants';
import {
  CorrectiveMaintCard,
  CorrectiveMaintOpenmaintService,
  UploadableFile,
} from '../maintenance-supervision/corrective-maint.openmaint.service';
import { PM_STATUS_IDS } from '../preventive-maintenance/constants/preventive-maint.constants';
import {
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
} from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import {
  EquipmentCard,
  EquipmentOpenmaintService,
} from './equipment.openmaint.service';

export type CorrectiveEquipment = {
  id: number;
  code: string | null;
  description: string | null;
  place: string | null;
};

export type EquipmentHistoryEntry = {
  id: number;
  kind: 'corrective' | 'preventive';
  number: string | null;
  subject: string | null;
  closedAt: string | null;
  attachmentCount: number;
};

/** `asset` = adjunto de la ficha del equipo; `manual-<id>` = de un manual. */
type DocumentSource = { kind: 'asset' } | { kind: 'manual'; manualId: number };

const CLOSED_STATUS_IDS: number[] = [
  CM_STATUS_IDS.COMPLETED,
  CM_STATUS_IDS.CANCELED,
];

@Injectable()
export class CorrectiveDocumentsService {
  private readonly logger = new Logger(CorrectiveDocumentsService.name);

  constructor(
    private readonly corrective: CorrectiveMaintOpenmaintService,
    private readonly preventive: PreventiveMaintenanceOpenmaintService,
    private readonly equipment: EquipmentOpenmaintService,
  ) {}

  // ── Adjuntos del correctivo ────────────────────────────────────────────────

  async getAttachments(sessionId: string, id: number) {
    const card = await this.fetchCard(sessionId, id);
    const data = await this.listAttachments(sessionId, card);

    return { success: true, data, meta: { total: data.length } };
  }

  async uploadAttachment(sessionId: string, id: number, file: UploadableFile) {
    const card = await this.fetchCard(sessionId, id);
    this.assertOpen(
      card,
      'No se pueden adjuntar archivos a un correctivo cerrado',
    );

    await this.call(
      () => this.corrective.uploadAttachment(sessionId, id, file),
      'Error al adjuntar el archivo en OpenMAINT',
    );

    this.logger.log(
      `Archivo "${file.originalname}" adjuntado al correctivo ${card.Number ?? id}`,
    );

    return this.getAttachments(sessionId, id);
  }

  /** El informe que genera OpenMAINT al cerrar no se puede borrar. */
  async deleteAttachment(sessionId: string, id: number, attachmentId: string) {
    const card = await this.fetchCard(sessionId, id);
    this.assertOpen(
      card,
      'No se pueden eliminar archivos de un correctivo cerrado',
    );

    const response = await this.call(
      () => this.corrective.findAttachments(sessionId, id),
      'Error al consultar los adjuntos en OpenMAINT',
    );
    const attachment = (response.data ?? []).find(
      (item) => item._id === attachmentId,
    );

    if (!attachment) {
      throw new NotFoundException('Adjunto no encontrado');
    }

    if (isGeneratedReport(attachment, card.Number ?? null)) {
      throw new ConflictException('El informe generado no se puede eliminar');
    }

    await this.call(
      () => this.corrective.deleteAttachment(sessionId, id, attachmentId),
      'Error al eliminar el archivo en OpenMAINT',
    );

    return this.getAttachments(sessionId, id);
  }

  async streamAttachment(
    sessionId: string,
    id: number,
    attachmentId: string,
    res: Response,
  ) {
    await this.stream(res, () =>
      this.corrective.downloadAttachment(sessionId, id, attachmentId),
    );
  }

  // ── Equipo intervenido ─────────────────────────────────────────────────────

  async getEquipmentDocuments(sessionId: string, id: number) {
    const equipment = await this.resolveEquipment(sessionId, id);

    if (!equipment) {
      return {
        success: true,
        data: [] as MaintenanceAttachment[],
        meta: { total: 0, equipment: null },
      };
    }

    const [own, manuals] = await Promise.all([
      this.equipment.findAttachments(sessionId, equipment).catch((error) => {
        this.throwIfSessionExpired(error);
        return [] as RawOpenmaintAttachment[];
      }),
      this.listManualAttachments(sessionId, equipment),
    ]);

    const data: MaintenanceAttachment[] = [
      ...own.map((attachment) =>
        toMaintenanceAttachment(
          attachment,
          this.documentUrl(id, 'asset', attachment._id),
        ),
      ),
      ...manuals.map(({ manualId, attachment }) =>
        toMaintenanceAttachment(
          attachment,
          this.documentUrl(id, `manual-${manualId}`, attachment._id),
        ),
      ),
    ];

    return {
      success: true,
      data,
      meta: { total: data.length, equipment: this.toEquipment(equipment) },
    };
  }

  async streamEquipmentDocument(
    sessionId: string,
    id: number,
    source: string,
    attachmentId: string,
    res: Response,
  ) {
    const parsed = this.parseSource(source);
    const equipment = await this.resolveEquipment(sessionId, id);

    if (!parsed || !equipment) {
      throw new NotFoundException('Documento no encontrado');
    }

    if (parsed.kind === 'asset') {
      return this.stream(res, () =>
        this.equipment.downloadAttachment(sessionId, equipment, attachmentId),
      );
    }

    // Solo manuales enlazados al equipo: el id de la URL no basta por sí solo.
    const manualIds =
      equipment.CISubset != null
        ? await this.equipment.findManualIdsBySubset(
            sessionId,
            equipment.CISubset,
          )
        : [];

    if (!manualIds.includes(parsed.manualId)) {
      throw new NotFoundException('Documento no encontrado');
    }

    return this.stream(res, () =>
      this.equipment.downloadManualAttachment(
        sessionId,
        parsed.manualId,
        attachmentId,
      ),
    );
  }

  /** Correctivos y preventivos ya cerrados sobre el mismo equipo, sin el actual. */
  async getEquipmentHistory(sessionId: string, id: number, limit: number) {
    const equipment = await this.resolveEquipment(sessionId, id);

    if (!equipment) {
      return {
        success: true,
        data: [] as EquipmentHistoryEntry[],
        meta: { total: 0, equipment: null },
      };
    }

    const [correctives, byCi, bySubset] = await Promise.all([
      this.call(
        () =>
          this.corrective.findByAsset(sessionId, equipment._id, {
            limit: limit + 1,
            statusIds: [CM_STATUS_IDS.COMPLETED],
          }),
        'Error al consultar el historial del equipo en OpenMAINT',
      ),
      this.findPreventives(sessionId, 'CI', equipment._id, limit),
      equipment.CISubset != null
        ? this.findPreventives(sessionId, 'CISubset', equipment.CISubset, limit)
        : Promise.resolve([] as PreventiveMaintCard[]),
    ]);

    const preventives = [...byCi, ...bySubset].filter(
      (card, index, all) =>
        all.findIndex((other) => other._id === card._id) === index,
    );

    const entries = [
      ...(correctives.data ?? [])
        .filter((card) => card._id !== id)
        .map((card) => this.toHistoryEntry('corrective', card)),
      ...preventives.map((card) => this.toHistoryEntry('preventive', card)),
    ]
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))
      .slice(0, limit);

    const counts = await Promise.allSettled(
      entries.map((entry) =>
        entry.kind === 'corrective'
          ? this.corrective.findAttachments(sessionId, entry.id)
          : this.preventive.findAttachments(sessionId, entry.id),
      ),
    );

    const data = entries.map((entry, index) => {
      const result = counts[index];
      return {
        ...entry,
        attachmentCount:
          result.status === 'fulfilled' ? (result.value.data?.length ?? 0) : 0,
      };
    });

    return {
      success: true,
      data,
      meta: { total: data.length, equipment: this.toEquipment(equipment) },
    };
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  private async listAttachments(
    sessionId: string,
    card: CorrectiveMaintCard,
  ): Promise<MaintenanceAttachment[]> {
    try {
      const response = await this.corrective.findAttachments(
        sessionId,
        card._id,
      );

      return (response.data ?? []).map((attachment) =>
        toMaintenanceAttachment(
          attachment,
          `/corrective-maintenance/${card._id}/attachments/${attachment._id}/download`,
          isGeneratedReport(attachment, card.Number ?? null),
        ),
      );
    } catch (error) {
      this.throwIfSessionExpired(error);
      return [];
    }
  }

  private async listManualAttachments(
    sessionId: string,
    equipment: EquipmentCard,
  ) {
    if (equipment.CISubset == null) {
      return [];
    }

    try {
      const manualIds = await this.equipment.findManualIdsBySubset(
        sessionId,
        equipment.CISubset,
      );
      const lists = await Promise.all(
        manualIds.map(async (manualId) =>
          (await this.equipment.findManualAttachments(sessionId, manualId)).map(
            (attachment) => ({ manualId, attachment }),
          ),
        ),
      );

      return lists.flat();
    } catch (error) {
      this.throwIfSessionExpired(error);
      return [];
    }
  }

  private async findPreventives(
    sessionId: string,
    equipmentAttr: 'CI' | 'CISubset',
    equipmentId: number,
    limit: number,
  ): Promise<PreventiveMaintCard[]> {
    try {
      const response = await this.preventive.findByEquipment(sessionId, {
        equipmentAttr,
        equipmentId,
        limit,
        offset: 0,
        statusIds: [PM_STATUS_IDS.COMPLETED],
      });

      return response.data ?? [];
    } catch (error) {
      this.throwIfSessionExpired(error);
      return [];
    }
  }

  private async resolveEquipment(
    sessionId: string,
    id: number,
  ): Promise<EquipmentCard | null> {
    const card = await this.fetchCard(sessionId, id);

    if (card.Asset == null) {
      return null;
    }

    try {
      return await this.equipment.findById(sessionId, card.Asset);
    } catch (error) {
      this.throwIfSessionExpired(error);
      this.logger.warn(
        `No se pudo leer el equipo ${card.Asset} del correctivo ${id}`,
      );
      return null;
    }
  }

  private async fetchCard(
    sessionId: string,
    id: number,
  ): Promise<CorrectiveMaintCard> {
    let card: CorrectiveMaintCard | undefined;

    try {
      card = (await this.corrective.findById(sessionId, id)).data;
    } catch (error) {
      this.throwIfSessionExpired(error);

      if (getHttpErrorStatus(error) === 404) {
        throw new NotFoundException('Correctivo no encontrado');
      }

      throw new BadGatewayException(
        'Error al consultar el correctivo en OpenMAINT',
      );
    }

    if (!card) {
      throw new NotFoundException('Correctivo no encontrado');
    }

    return card;
  }

  private assertOpen(card: CorrectiveMaintCard, message: string) {
    const closed =
      (card.ProcessStatus != null &&
        CLOSED_STATUS_IDS.includes(card.ProcessStatus)) ||
      (card._FlowStatus_code ?? '').startsWith('closed');

    if (closed) {
      throw new ConflictException(message);
    }
  }

  private toEquipment(card: EquipmentCard): CorrectiveEquipment {
    const place = [card._Building_description, card._Floor_description]
      .filter(Boolean)
      .join(' · ');

    return {
      id: card._id,
      code: card.Code ?? null,
      description: card.Description ?? null,
      place: place || null,
    };
  }

  private toHistoryEntry(
    kind: 'corrective' | 'preventive',
    card: CorrectiveMaintCard | PreventiveMaintCard,
  ): Omit<EquipmentHistoryEntry, 'attachmentCount'> {
    return {
      id: card._id,
      kind,
      number: card.Number ?? null,
      subject: card.ShortDescr ?? null,
      closedAt: card.ExecEndDate ?? card.OpeningDate ?? null,
    };
  }

  private documentUrl(id: number, source: string, attachmentId: string) {
    return `/corrective-maintenance/${id}/documents/${source}/${attachmentId}/download`;
  }

  private parseSource(source: string): DocumentSource | null {
    if (source === 'asset') {
      return { kind: 'asset' };
    }

    const match = /^manual-(\d+)$/.exec(source);
    return match ? { kind: 'manual', manualId: Number(match[1]) } : null;
  }

  private async stream(res: Response, download: () => Promise<DownloadedFile>) {
    let file: DownloadedFile;

    try {
      file = await download();
    } catch (error) {
      this.throwIfSessionExpired(error);
      const status = getHttpErrorStatus(error);

      if (status === 404 || status === 400) {
        throw new NotFoundException('Adjunto no encontrado');
      }

      throw new BadGatewayException(
        'Error al descargar el adjunto desde OpenMAINT',
      );
    }

    sendDownloadedFile(res, file);
  }

  private async call<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.throwIfSessionExpired(error);
      throw new BadGatewayException(message);
    }
  }

  private throwIfSessionExpired(error: unknown): void {
    if (getHttpErrorStatus(error) === 401) {
      throw new UnauthorizedException('La sesión de OpenMAINT ha expirado');
    }
  }
}
