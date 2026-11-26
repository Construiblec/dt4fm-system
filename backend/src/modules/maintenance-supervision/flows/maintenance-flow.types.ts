import type {
  DownloadedFile,
  RawOpenmaintAttachment,
} from '../../../common/utils/openmaint-attachment.util';
import type {
  MaintenanceChecklist,
  MaintenanceKind,
  MaintenanceReadAttachment,
  MaintenanceReadDetail,
  MaintenanceReadFilters,
  MaintenanceReadItem,
} from '../maintenance-integration.types';

export type DetailExtras = {
  attachments: MaintenanceReadAttachment[];
  /** Solo lo usan los preventivos. */
  checklist: MaintenanceChecklist | null;
};

/**
 * Lo que cambia entre correctivos y preventivos al leer. La escritura sumará
 * aquí `prepare(card, fields)` y `cancelSteps(card)`, que devuelven los pasos.
 */
export interface MaintenanceFlow<
  TCard extends { _id: number } = { _id: number },
> {
  readonly kind: MaintenanceKind;
  /** Segmento de la ruta pública: `correctives` o `preventives`. */
  readonly path: 'correctives' | 'preventives';

  search(
    sessionId: string,
    filters: MaintenanceReadFilters,
  ): Promise<{ cards: TCard[]; total: number | null }>;
  fetch(sessionId: string, id: number): Promise<TCard | undefined>;
  attachments(sessionId: string, id: number): Promise<RawOpenmaintAttachment[]>;
  download(
    sessionId: string,
    id: number,
    attachmentId: string,
  ): Promise<DownloadedFile>;
  toItem(card: TCard): MaintenanceReadItem;
  toDetail(card: TCard, extras: DetailExtras): MaintenanceReadDetail;
}
