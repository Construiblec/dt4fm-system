import { Injectable } from '@nestjs/common';
import { extractRegisterLog } from '../../../common/utils/openmaint-register.util';
import { PM_STATUS_CODE_TO_NAME } from '../../preventive-maintenance/constants/preventive-maint.constants';
import {
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
} from '../../preventive-maintenance/preventive-maintenance.openmaint.service';
import type {
  MaintenanceReadFilters,
  PreventiveReadDetail,
  PreventiveReadFilters,
  PreventiveReadItem,
} from '../maintenance-integration.types';
import type { DetailExtras, MaintenanceFlow } from './maintenance-flow.types';
import {
  isClosedFlow,
  isOverdueDate,
  toRef,
  translated,
} from './projection.util';

@Injectable()
export class PreventiveFlow implements MaintenanceFlow<PreventiveMaintCard> {
  readonly kind = 'preventive' as const;
  readonly path = 'preventives' as const;

  constructor(
    private readonly gateway: PreventiveMaintenanceOpenmaintService,
  ) {}

  async search(sessionId: string, filters: MaintenanceReadFilters) {
    const f = filters as PreventiveReadFilters;
    const response = await this.gateway.search(sessionId, {
      limit: f.limit,
      offset: f.offset,
      status: f.status,
      assigned: f.assigned,
      employeeId: f.employeeId,
      teamId: f.teamId,
      buildingId: f.buildingId,
      assetId: f.assetId,
      planId: f.planId,
      opened: { from: f.openedFrom, to: f.openedTo },
      planned: { from: f.plannedFrom, to: f.plannedTo },
      due: { from: f.dueFrom, to: f.dueTo },
      started: { from: f.startedFrom, to: f.startedTo },
      ended: { from: f.endedFrom, to: f.endedTo },
    });

    if (!Array.isArray(response?.data)) {
      throw new Error('la fuente respondió sin listado');
    }
    return { cards: response.data, total: response.meta?.total ?? null };
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

  toItem(card: PreventiveMaintCard): PreventiveReadItem {
    const code = card._ProcessStatus_code ?? null;
    const isClosed = isClosedFlow(card._FlowStatus_code);
    const dueDate = card.DueExecEndDate ?? null;

    return {
      kind: 'preventive',
      id: card._id,
      number: card.Number ?? null,
      title: card.ShortDescr ?? null,
      status: code ? (PM_STATUS_CODE_TO_NAME[code] ?? code) : null,
      statusLabel: translated(
        card._ProcessStatus_description_translation,
        card._ProcessStatus_description,
      ),
      isClosed,
      building: toRef(card.Site, card._Site_description),
      assignee: toRef(card.Assignee, card._Assignee_description),
      team: toRef(card.Team, card._Team_description),
      openingDate: card.OpeningDate ?? null,
      plannedStartTime: card.ExpExecStartDate ?? null,
      actualStartTime: card.ExecStartDate ?? null,
      actualEndTime: card.ExecEndDate ?? null,
      warnings: [],
      asset: card.CISubset
        ? toRef(card.CISubset, card._CISubset_description)
        : toRef(card.CI, card._CI_description),
      plan: toRef(card.PrevMaintConfig, card._PrevMaintConfig_description),
      dueDate,
      isOverdue: isOverdueDate(dueDate, isClosed),
      // Solo trae valor mientras está suspendido.
      suspensionReason: translated(
        card._SuspensionReason_description_translation,
        card._SuspensionReason_description,
      ),
    };
  }

  toDetail(
    card: PreventiveMaintCard,
    { attachments, checklist }: DetailExtras,
  ): PreventiveReadDetail {
    const register = card.Register ?? card._Register_html ?? null;

    return {
      ...this.toItem(card),
      log: extractRegisterLog(register, card._ProcessStatus_code),
      attachments,
      checklist,
    };
  }
}
