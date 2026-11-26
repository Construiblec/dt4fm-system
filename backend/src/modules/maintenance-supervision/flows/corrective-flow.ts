import { Injectable } from '@nestjs/common';
import { toCategoryRefs } from '../../../integrations/openmaint/maint-category-catalog.service';
import {
  extractRegisterLog,
  extractReportNotes,
} from '../../../common/utils/openmaint-register.util';
import {
  CM_PRIORITY_CODE_TO_ID,
  CM_PRIORITY_CODES,
  CM_STATUS_NAMES,
  CmStatusId,
  resolveCorrectiveStatus,
} from '../constants/corrective-maint.constants';
import {
  CorrectiveMaintCard,
  CorrectiveMaintOpenmaintService,
} from '../corrective-maint.openmaint.service';
import type {
  CorrectiveReadDetail,
  CorrectiveReadFilters,
  CorrectiveReadItem,
  MaintenanceReadFilters,
} from '../maintenance-integration.types';
import type { DetailExtras, MaintenanceFlow } from './maintenance-flow.types';
import { isClosedFlow, toRef, translated } from './projection.util';

/** Estado público del correctivo; sin código, el del id del proceso. */
const statusOf = (card: CorrectiveMaintCard): string | null =>
  resolveCorrectiveStatus(card._ProcessStatus_code, card.ExecStartDate) ??
  (card.ProcessStatus
    ? (CM_STATUS_NAMES[card.ProcessStatus as CmStatusId] ?? null)
    : null);

/** Motivo del rechazo: la nota de la última entrada del registro, solo si es de CM02. */
const cancelReasonOf = (
  card: CorrectiveMaintCard,
  status: string | null,
  register: string | null,
): string | null => {
  if (status !== 'Canceled') return null;
  const last = extractRegisterLog(register, card._ProcessStatus_code).at(-1);
  return last?.stepCode === 'CM02' ? last.note || null : null;
};

@Injectable()
export class CorrectiveFlow implements MaintenanceFlow<CorrectiveMaintCard> {
  readonly kind = 'corrective' as const;
  readonly path = 'correctives' as const;

  constructor(private readonly gateway: CorrectiveMaintOpenmaintService) {}

  async search(sessionId: string, filters: MaintenanceReadFilters) {
    const f = filters as CorrectiveReadFilters;
    const response = await this.gateway.search(sessionId, {
      limit: f.limit,
      offset: f.offset,
      status: f.status,
      assigned: f.assigned,
      employeeId: f.employeeId,
      teamId: f.teamId,
      buildingId: f.buildingId,
      unitId: f.unitId,
      priorityId: this.priorityId(f.priority),
      categoryId: f.categoryId,
      subcategoryId: f.subcategoryId,
      opened: { from: f.openedFrom, to: f.openedTo },
      planned: { from: f.plannedFrom, to: f.plannedTo },
      started: { from: f.startedFrom, to: f.startedTo },
      ended: { from: f.endedFrom, to: f.endedTo },
    });

    if (!Array.isArray(response?.data)) {
      throw new Error('la fuente respondió sin listado');
    }
    return { cards: response.data, total: response.meta?.total ?? null };
  }

  private priorityId(priority?: string): number | undefined {
    if (priority === undefined) return undefined;
    if (!Object.hasOwn(CM_PRIORITY_CODE_TO_ID, priority)) {
      throw new Error(`Prioridad de correctivo desconocida: ${priority}`);
    }
    return CM_PRIORITY_CODE_TO_ID[priority];
  }

  async fetch(sessionId: string, id: number) {
    return (await this.gateway.findById(sessionId, id))?.data;
  }

  async attachments(sessionId: string, id: number) {
    const response = await this.gateway.findAttachments(sessionId, id);
    if (!Array.isArray(response?.data)) {
      throw new Error('la fuente respondió sin listado');
    }
    return response.data;
  }

  download(sessionId: string, id: number, attachmentId: string) {
    return this.gateway.downloadAttachment(sessionId, id, attachmentId);
  }

  toItem(card: CorrectiveMaintCard): CorrectiveReadItem {
    const status = statusOf(card);
    const isPendingReview = status === 'Accounting';
    const priorityCode =
      card.Priority != null ? CM_PRIORITY_CODES[card.Priority] : undefined;

    return {
      kind: 'corrective',
      id: card._id,
      number: card.Number ?? null,
      title: card.ShortDescr ?? null,
      status,
      // «Asignado» no existe en OpenMAINT: su texto sería el de Execution.
      statusLabel:
        status === 'Assigned'
          ? 'Asignado'
          : translated(
              card._ProcessStatus_description_translation,
              card._ProcessStatus_description,
            ),
      isClosed: isClosedFlow(card._FlowStatus_code),
      building: toRef(card.Site, card._Site_description),
      assignee: toRef(card.Assignee, card._Assignee_description),
      team: toRef(card.Team, card._Team_description),
      openingDate: card.OpeningDate ?? null,
      plannedStartTime: card.ExpExecStartDate ?? null,
      actualStartTime: card.ExecStartDate ?? null,
      actualEndTime: card.ExecEndDate ?? null,
      warnings: isPendingReview ? ['pending_review'] : [],
      priority: priorityCode
        ? {
            code: priorityCode,
            label:
              translated(
                card._Priority_description_translation,
                card._Priority_description,
              ) ?? priorityCode,
          }
        : null,
      ...toCategoryRefs(card),
      floor: toRef(card.Floor, card._Floor_description),
      unit: toRef(card.Unit, card._Unit_description),
      commonArea: toRef(card.CommonArea, card._CommonArea_description),
      asset: toRef(card.Asset, card._Asset_description),
      closureDate: card.ClosureDate ?? null,
      isPendingReview,
    };
  }

  toDetail(
    card: CorrectiveMaintCard,
    { attachments }: DetailExtras,
  ): CorrectiveReadDetail {
    const item = this.toItem(card);
    const register = card.Register ?? card._Register_html ?? null;

    return {
      ...item,
      log: extractRegisterLog(register, card._ProcessStatus_code),
      attachments,
      reportNotes: extractReportNotes(register),
      cancelReason: cancelReasonOf(card, item.status, register),
    };
  }
}
