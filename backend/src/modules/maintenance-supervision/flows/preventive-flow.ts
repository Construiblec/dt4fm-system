import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { extractRegisterLog } from '../../../common/utils/openmaint-register.util';
import {
  PM_ACTIONS,
  PM_STATUS_CODE_TO_NAME,
  PM_STATUS_NAMES,
  type PmStatusId,
} from '../../preventive-maintenance/constants/preventive-maint.constants';
import {
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
} from '../../preventive-maintenance/preventive-maintenance.openmaint.service';
import type {
  MaintenancePlanFields,
  MaintenancePlanWarning,
  MaintenanceReadFilters,
  PreventiveReadDetail,
  PreventiveReadFilters,
  PreventiveReadItem,
} from '../maintenance-integration.types';
import { assertReassignable, toSeconds } from '../maintenance-rules';
import type {
  DetailExtras,
  FlowOutcome,
  FlowStep,
  MaintenanceWriteFlow,
  PrepareContext,
} from './maintenance-flow.types';
import {
  isClosedFlow,
  isOverdueDate,
  toRef,
  translated,
} from './projection.util';

/** Estado público; sin código, el del id del proceso. */
const statusOf = (card: PreventiveMaintCard): string | null => {
  const code = card._ProcessStatus_code;
  if (code) return PM_STATUS_CODE_TO_NAME[code] ?? null;
  return card.ProcessStatus
    ? (PM_STATUS_NAMES[card.ProcessStatus as PmStatusId] ?? null)
    : null;
};

const conflict = (message: string): FlowOutcome => ({
  error: new ConflictException(message),
});

const requireActivityId = (card: PreventiveMaintCard): string => {
  const activityId = card._tasklist?.[0]?._id;
  if (!activityId) {
    throw new ConflictException(
      `El preventivo ${card._id} no tiene una actividad disponible; probablemente ya está cerrado`,
    );
  }
  return activityId;
};

@Injectable()
export class PreventiveFlow implements MaintenanceWriteFlow<PreventiveMaintCard> {
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

  async fetchForWrite(sessionId: string, id: number) {
    return (await this.gateway.findWithTasklist(sessionId, id))?.data;
  }

  statusOf(card: PreventiveMaintCard): string | null {
    return statusOf(card);
  }

  prepare(
    card: PreventiveMaintCard,
    fields: MaintenancePlanFields,
    { employees, teamIds, currentIsSupplier }: PrepareContext,
  ): FlowOutcome {
    const status = statusOf(card);
    const closed = status === 'Completed' || status === 'Canceled';
    const warnings: MaintenancePlanWarning[] = closed
      ? ['closed']
      : status === 'Execution' || status === 'Suspension'
        ? ['started']
        : [];

    const employeeId =
      fields.employeeId !== undefined && fields.employeeId !== card.Assignee
        ? fields.employeeId
        : undefined;
    const nextStart =
      fields.plannedStartTime === undefined
        ? undefined
        : toSeconds(fields.plannedStartTime);
    if (nextStart === null) {
      return {
        error: new BadRequestException(
          'plannedStartTime no es una fecha válida',
        ),
      };
    }
    const plannedStart =
      nextStart !== undefined && nextStart !== toSeconds(card.ExpExecStartDate)
        ? new Date(nextStart * 1000).toISOString()
        : undefined;

    if (employeeId === undefined && plannedStart === undefined) {
      return { steps: [], warnings };
    }
    if (closed) {
      return conflict('El preventivo está cerrado y ya no admite cambios');
    }
    if (status === null) {
      return conflict('El preventivo está en un estado que no admite cambios');
    }

    if (employeeId !== undefined) {
      try {
        assertReassignable(
          employees,
          card.Assignee,
          employeeId,
          teamIds,
          currentIsSupplier,
        );
      } catch (error) {
        if (error instanceof HttpException) return { error };
        throw error;
      }
    }

    const assignee = employeeId === undefined ? {} : { Assignee: employeeId };
    const start =
      plannedStart === undefined ? {} : { ExpExecStartDate: plannedStart };

    if (status === 'Planning') {
      if (employeeId === undefined) {
        return conflict('La fecha se fija después de asignar');
      }
      const steps: FlowStep[] = [
        {
          type: 'advance',
          action: PM_ACTIONS.ASSIGN,
          fields: assignee,
          description: 'Asignación de técnico',
          expectStatus: 'Acceptance',
          expectFields: assignee,
          assigns: true,
        },
      ];
      if (plannedStart !== undefined) {
        steps.push({
          type: 'save',
          fields: start,
          description: 'Fecha prevista de inicio',
          expectStatus: 'Acceptance',
          expectFields: start,
          warnIfFails: 'planned_start_not_saved',
          warnIfUnconfirmed: 'planned_start_unconfirmed',
        });
      }
      return { steps, warnings };
    }

    if (status === 'Acceptance') {
      const both = { ...assignee, ...start };
      return {
        steps: [
          {
            type: 'save',
            fields: both,
            description: 'Cambio de técnico o de fecha prevista',
            expectStatus: 'Acceptance',
            expectFields: both,
          },
        ],
        warnings,
      };
    }

    // Execution y Suspension: la fecha ya no se puede mover.
    if (plannedStart !== undefined) {
      return conflict(
        'La fecha prevista ya no se puede cambiar: el preventivo ya empezó',
      );
    }
    if (status === 'Suspension') {
      return {
        steps: [
          {
            type: 'advance',
            action: PM_ACTIONS.CHANGE_ASSIGNEE,
            fields: assignee,
            description: 'Cambio de técnico',
            expectStatus: 'Suspension',
            expectFields: assignee,
          },
        ],
        warnings,
      };
    }
    return {
      steps: [
        {
          type: 'save',
          fields: assignee,
          description: 'Cambio de técnico',
          expectStatus: 'Execution',
          expectFields: assignee,
        },
      ],
      warnings,
    };
  }

  cancelSteps(card: PreventiveMaintCard, reason: string): FlowOutcome {
    const status = statusOf(card);
    if (status === 'Canceled') return { steps: [], warnings: ['closed'] };
    if (status !== 'Planning') {
      return conflict('Solo se puede cancelar un preventivo en planificación');
    }
    return {
      steps: [
        {
          type: 'advance',
          action: PM_ACTIONS.CANCEL,
          fields: {},
          description: reason,
          expectStatus: 'Canceled',
          expectFields: {},
        },
      ],
      warnings: [],
    };
  }

  async execute(
    sessionId: string,
    card: PreventiveMaintCard,
    step: FlowStep,
    note: string,
  ): Promise<void> {
    const activityId = requireActivityId(card);
    if (step.type === 'advance') {
      await this.gateway.advance(sessionId, card._id, {
        activityId,
        action: step.action,
        notes: note,
        fields: step.fields,
      });
    } else if (step.type === 'save') {
      await this.gateway.saveFields(sessionId, card._id, {
        activityId,
        fields: step.fields,
      });
    } else {
      throw new Error('El preventivo no restaura el inicio real');
    }
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
