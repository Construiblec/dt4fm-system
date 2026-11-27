import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  correctiveTitle,
  toCategoryRefs,
} from '../../../integrations/openmaint/maint-category-catalog.service';
import {
  extractRegisterLog,
  extractReportNotes,
} from '../../../common/utils/openmaint-register.util';
import {
  CM_ACTIONS,
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
  MaintenancePlanFields,
  MaintenancePlanWarning,
  MaintenanceReadFilters,
} from '../maintenance-integration.types';
import {
  assertReassignable,
  missingForAssign,
  toSeconds,
} from '../maintenance-rules';
import type {
  DetailExtras,
  FlowOutcome,
  FlowStep,
  MaintenanceWriteFlow,
  PrepareContext,
} from './maintenance-flow.types';
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

const BACK_VARIABLE = 'OPENMAINT_CM_BACK_TO_ASSIGNMENT_ACTION_ID';
const RESCHEDULE_UNAVAILABLE =
  'Reprogramar un correctivo ya asignado aún no está disponible; solo se puede cambiar el técnico';
const CANCEL_UNAVAILABLE =
  'Cancelar un correctivo ya asignado aún no está disponible';
const CHAIN_FAILED_REASSIGN =
  'El correctivo quedó por asignar sin aplicar el cambio; comprobar antes de repetir';
const CHAIN_FAILED_CANCEL =
  'El correctivo quedó por asignar sin cancelar; repetir lo cancela';

const requireActivityId = (card: CorrectiveMaintCard): string => {
  const activityId = card._tasklist?.[0]?._id;
  if (!activityId) {
    throw new ConflictException(
      `El correctivo ${card._id} no tiene una actividad disponible; probablemente ya está cerrado`,
    );
  }
  return activityId;
};

/** Al entrar en Execution la fuente copia la fecha prevista al inicio real: «Assigned» o «Execution». */
const EXECUTION_STATES = ['Execution', 'Assigned'];

const restoreStep = (value: string | null): FlowStep => ({
  type: 'restoreExecStart',
  value,
  description: 'Restablecer el inicio real',
  expectStatus: value === null ? 'Assigned' : 'Execution',
  expectFields: { ExecStartDate: value },
  warnIfFails: 'exec_start_not_restored',
});

const changeAssigneeStep = (employeeId: number): FlowStep => ({
  type: 'advance',
  action: CM_ACTIONS.CHANGE_ASSIGNEE,
  fields: { Assignee: employeeId },
  description: 'Cambio de técnico',
  expectStatus: EXECUTION_STATES,
  expectFields: { Assignee: employeeId },
  assigns: true,
});

type CardEdit = {
  plannedStart?: string;
  priorityId?: number;
  title?: string;
  category?: { category: { id: number }; subcategory: { id: number } };
  teamId?: number;
};

@Injectable()
export class CorrectiveFlow implements MaintenanceWriteFlow<CorrectiveMaintCard> {
  readonly kind = 'corrective' as const;
  readonly path = 'correctives' as const;

  constructor(
    private readonly gateway: CorrectiveMaintOpenmaintService,
    private readonly config: ConfigService,
  ) {}

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

  async fetchForWrite(sessionId: string, id: number) {
    return (await this.gateway.findWithTasklist(sessionId, id))?.data;
  }

  statusOf(card: CorrectiveMaintCard): string | null {
    return statusOf(card);
  }

  needsEmployees(
    card: CorrectiveMaintCard,
    fields: MaintenancePlanFields,
  ): boolean {
    return (
      fields.employeeId !== undefined ||
      fields.teamId !== undefined ||
      // Reprogramar un asignado vuelve a despachar al técnico que ya tiene.
      (statusOf(card) === 'Assigned' &&
        (fields.plannedStartTime !== undefined ||
          fields.priority !== undefined ||
          fields.categoryId !== undefined))
    );
  }

  categoryToResolve(card: CorrectiveMaintCard, fields: MaintenancePlanFields) {
    const categoryId = fields.categoryId ?? card.Category;
    const subcategoryId = fields.subcategoryId ?? card.Subcategory;
    if (categoryId == null || subcategoryId == null) return null;

    const status = statusOf(card);
    const categoryChanged =
      fields.categoryId !== undefined &&
      (fields.categoryId !== card.Category ||
        fields.subcategoryId !== card.Subcategory);
    const explicit = categoryChanged || fields.otherDescription !== undefined;
    const start =
      fields.plannedStartTime !== undefined &&
      toSeconds(fields.plannedStartTime) !== toSeconds(card.ExpExecStartDate);
    const reschedules =
      start ||
      (fields.priority !== undefined &&
        CM_PRIORITY_CODE_TO_ID[fields.priority] !== card.Priority) ||
      (fields.teamId !== undefined && fields.teamId !== card.Team);
    const dispatching =
      (status === 'Assignment' && fields.employeeId !== undefined) ||
      (status === 'Assigned' && reschedules);
    return explicit || dispatching ? { categoryId, subcategoryId } : null;
  }

  /** Único punto que depende de la acción «Volver a asignación» de CM03. */
  returnToAssignment(unavailable = RESCHEDULE_UNAVAILABLE): FlowStep {
    const raw = this.config.get<string>(BACK_VARIABLE)?.trim() ?? '';
    const action = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (!Number.isSafeInteger(action) || action <= 0) {
      throw new ConflictException(unavailable);
    }
    return {
      type: 'advance',
      action,
      fields: {},
      description: 'Volver a asignación',
      expectStatus: 'Assignment',
      expectFields: {},
    };
  }

  prepare(
    card: CorrectiveMaintCard,
    fields: MaintenancePlanFields,
    context: PrepareContext,
  ): FlowOutcome {
    try {
      return this.plan(card, fields, context);
    } catch (error) {
      if (error instanceof HttpException) return { error };
      throw error;
    }
  }

  private plan(
    card: CorrectiveMaintCard,
    fields: MaintenancePlanFields,
    context: PrepareContext,
  ): FlowOutcome {
    const status = statusOf(card);
    const warnings: MaintenancePlanWarning[] =
      status === 'Completed' || status === 'Canceled'
        ? ['closed']
        : status === 'Execution'
          ? ['started']
          : status === 'Accounting'
            ? ['pending_review']
            : [];

    if (
      (fields.categoryId === undefined) !==
      (fields.subcategoryId === undefined)
    ) {
      throw new BadRequestException(
        'categoryId y subcategoryId se envían juntos',
      );
    }
    const resolved = context.category;
    if (fields.otherDescription !== undefined && !resolved) {
      throw new BadRequestException(
        'otherDescription requiere una categoría y una subcategoría',
      );
    }
    const nextStart =
      fields.plannedStartTime === undefined
        ? undefined
        : toSeconds(fields.plannedStartTime);
    if (nextStart === null) {
      throw new BadRequestException('plannedStartTime no es una fecha válida');
    }
    if (
      fields.priority !== undefined &&
      !Object.hasOwn(CM_PRIORITY_CODE_TO_ID, fields.priority)
    ) {
      throw new BadRequestException('priority no es válida');
    }

    const plannedStart =
      nextStart !== undefined && nextStart !== toSeconds(card.ExpExecStartDate)
        ? new Date(nextStart * 1000).toISOString()
        : undefined;
    const priorityId =
      fields.priority === undefined
        ? undefined
        : CM_PRIORITY_CODE_TO_ID[fields.priority];
    // Con «Otro» sin texto nuevo se conserva el título solo si la subcategoría no cambia.
    const title = resolved
      ? correctiveTitle(
          resolved.subcategory,
          fields.otherDescription ??
            (resolved.subcategory.isOther &&
            card.Subcategory === resolved.subcategory.id
              ? card.ShortDescr
              : null),
        )
      : undefined;

    const employeeChanged =
      fields.employeeId !== undefined && fields.employeeId !== card.Assignee;
    const teamChanged =
      fields.teamId !== undefined && fields.teamId !== card.Team;
    const startChanged = plannedStart !== undefined;
    const priorityChanged =
      priorityId !== undefined && priorityId !== card.Priority;
    const categoryChanged =
      fields.categoryId !== undefined &&
      (fields.categoryId !== card.Category ||
        fields.subcategoryId !== card.Subcategory);
    const titleChanged =
      title !== undefined &&
      title !== card.ShortDescr &&
      (categoryChanged || fields.otherDescription !== undefined);
    const cardChanged =
      teamChanged ||
      startChanged ||
      priorityChanged ||
      categoryChanged ||
      titleChanged;
    const changed = employeeChanged || cardChanged;

    const refuse = (message: string): never => {
      throw new ConflictException(message);
    };
    const unchanged: FlowOutcome = { steps: [], warnings };
    if (status === 'Completed' || status === 'Canceled') {
      return changed
        ? refuse('El correctivo está cerrado y ya no admite cambios')
        : unchanged;
    }
    if (status === 'Accounting') {
      return changed
        ? refuse(
            'El correctivo está pendiente de revisión y ya no admite cambios',
          )
        : unchanged;
    }
    if (
      status !== 'Assignment' &&
      status !== 'Assigned' &&
      status !== 'Execution' &&
      status !== 'Management'
    ) {
      return changed
        ? refuse('El correctivo está en un estado que no admite cambios')
        : unchanged;
    }

    const edit: CardEdit = {
      plannedStart,
      priorityId: priorityChanged ? priorityId : undefined,
      title,
      category: categoryChanged ? resolved : undefined,
      teamId: teamChanged ? fields.teamId : undefined,
    };

    if (status === 'Assignment') {
      if (fields.employeeId !== undefined) {
        return {
          steps: this.dispatch(card, fields, context, edit, null),
          warnings,
        };
      }
      this.assertTeam(fields.teamId, context);
      if (teamChanged && card.Assignee != null) {
        this.assertTechnician(card, fields, context, fields.teamId);
      }
      const save = this.cardFields(edit, categoryChanged || titleChanged);
      const steps: FlowStep[] = cardChanged
        ? [
            {
              type: 'save',
              fields: { ...save.hard, ...save.soft },
              description: 'Cambio de la tarjeta del correctivo',
              expectStatus: 'Assignment',
              expectFields: save.hard,
              softFields: save.soft,
            },
          ]
        : [];
      // Con técnico puesto pero sin despachar, nadie ha avisado al técnico.
      return {
        steps,
        warnings:
          card.Assignee != null ? [...warnings, 'not_dispatched'] : warnings,
      };
    }

    if (status === 'Assigned') {
      if (!changed) return unchanged;
      if (!cardChanged) {
        this.assertTechnician(card, fields, context, card.Team);
        return {
          steps: [
            changeAssigneeStep(fields.employeeId as number),
            restoreStep(null),
          ],
          warnings,
        };
      }
      const back = this.returnToAssignment();
      return {
        steps: [
          back,
          ...this.dispatch(card, fields, context, edit, CHAIN_FAILED_REASSIGN),
        ],
        warnings,
      };
    }

    if (status === 'Execution') {
      if (cardChanged) {
        return refuse(
          'El correctivo ya empezó: solo se puede cambiar el técnico',
        );
      }
      if (!employeeChanged) return unchanged;
      this.assertTechnician(card, fields, context, card.Team);
      return {
        steps: [
          {
            ...changeAssigneeStep(fields.employeeId as number),
            expectStatus: 'Execution',
          },
          restoreStep(card.ExecStartDate ?? null),
        ],
        warnings,
      };
    }

    // Management
    if (startChanged || priorityChanged || categoryChanged || titleChanged) {
      return refuse(
        'El correctivo está en gestión: solo se puede cambiar el técnico o el equipo',
      );
    }
    if (!employeeChanged && !teamChanged) return unchanged;
    this.assertTechnician(card, fields, context, fields.teamId ?? card.Team);
    const managed = {
      ...(employeeChanged ? { Assignee: fields.employeeId } : {}),
      ...(teamChanged ? { Team: fields.teamId } : {}),
    };
    return {
      steps: [
        {
          type: 'save',
          fields: managed,
          description: 'Cambio de técnico o de equipo',
          expectStatus: 'Management',
          expectFields: managed,
        },
      ],
      warnings,
    };
  }

  /** Atributos que cambian; los blandos puede descartarlos la fuente. */
  private cardFields(edit: CardEdit, writeTitle: boolean) {
    const hard: Record<string, unknown> = {};
    const soft: Record<string, unknown> = {};
    if (edit.plannedStart !== undefined) {
      hard.ExpExecStartDate = edit.plannedStart;
    }
    if (edit.teamId !== undefined) hard.Team = edit.teamId;
    if (edit.priorityId !== undefined) soft.Priority = edit.priorityId;
    if (edit.category) {
      soft.Category = edit.category.category.id;
      soft.Subcategory = edit.category.subcategory.id;
    }
    if (writeTitle && edit.title !== undefined) soft.ShortDescr = edit.title;
    return { hard, soft };
  }

  /** `CM02-Advance` con la tarjeta fusionada y, después, limpiar el inicio real autocopiado. */
  private dispatch(
    card: CorrectiveMaintCard,
    fields: MaintenancePlanFields,
    context: PrepareContext,
    edit: CardEdit,
    failMessage: string | null,
  ): FlowStep[] {
    const resolved = context.category;
    const employeeId = fields.employeeId ?? card.Assignee;
    if (employeeId == null) throw new BadRequestException('Faltan: employeeId');

    const employee = context.employees.find((e) => e.id === employeeId);
    const team = fields.teamId ?? card.Team ?? employee?.team?.id;
    if (fields.employeeId === undefined) {
      // Reprogramar sin cambiar de técnico: el actual debe seguir siendo válido.
      this.assertTeam(fields.teamId, context);
      const stale =
        !employee || employee.isSupplier
          ? 'no es un técnico de mantenimiento o es un proveedor'
          : team != null && employee.team?.id !== team
            ? 'no pertenece al equipo de destino'
            : null;
      if (stale) {
        throw new ConflictException(
          `El técnico actual ${stale}; reasignarlo antes de reprogramar`,
        );
      }
    } else {
      this.assertTechnician(card, fields, context, team);
    }

    const merged = {
      plannedStartTime: edit.plannedStart ?? card.ExpExecStartDate,
      priority: edit.priorityId ?? card.Priority,
      categoryId: fields.categoryId ?? card.Category,
      subcategoryId: fields.subcategoryId ?? card.Subcategory,
    };
    const missing = missingForAssign(merged);
    if (!resolved && missing.length === 0) missing.push('categoryId');
    if (missing.length > 0 || !resolved || edit.title === undefined) {
      throw new BadRequestException(`Faltan: ${missing.join(', ')}`);
    }

    const soft: Record<string, unknown> = {
      Priority: merged.priority,
      Category: resolved.category.id,
      Subcategory: resolved.subcategory.id,
      ShortDescr: edit.title,
    };
    if (team != null) soft.Team = team;
    if (edit.plannedStart !== undefined) {
      soft.ExpExecStartDate = edit.plannedStart;
    }

    return [
      {
        type: 'advance',
        action: CM_ACTIONS.ASSIGN,
        fields: { Assignee: employeeId, ...soft },
        description: 'Asignación de técnico',
        expectStatus: EXECUTION_STATES,
        expectFields: { Assignee: employeeId },
        softFields: soft,
        assigns: true,
        unconfirmedMessage:
          'No se pudo confirmar la asignación: el correctivo puede haber quedado iniciado; revisarlo antes de repetir',
        ...(failMessage ? { failMessage } : {}),
      },
      restoreStep(null),
    ];
  }

  private assertTeam(
    teamId: number | undefined,
    context: PrepareContext,
  ): void {
    if (teamId !== undefined && !context.teamIds.includes(teamId)) {
      throw new BadRequestException('teamId no es un equipo de mantenimiento');
    }
  }

  /** El técnico efectivo debe ser del equipo de destino; el nuevo, además, reasignable. */
  private assertTechnician(
    card: CorrectiveMaintCard,
    fields: MaintenancePlanFields,
    context: PrepareContext,
    destinationTeam: number | null | undefined,
  ): void {
    this.assertTeam(fields.teamId, context);
    const employeeId = fields.employeeId ?? card.Assignee;
    if (employeeId == null) return;
    if (fields.employeeId !== undefined) {
      assertReassignable(
        context.employees,
        card.Assignee,
        fields.employeeId,
        context.teamIds,
        context.currentIsSupplier,
      );
    }
    const employee = context.employees.find((e) => e.id === employeeId);
    if (!employee) {
      throw new ConflictException(
        'No se pudo comprobar el equipo del técnico de la orden',
      );
    }
    if (destinationTeam != null && employee.team?.id !== destinationTeam) {
      throw new ConflictException(
        'El técnico debe pertenecer al equipo de destino',
      );
    }
  }

  cancelSteps(card: CorrectiveMaintCard, reason: string): FlowOutcome {
    const status = statusOf(card);
    if (status === 'Canceled') return { steps: [], warnings: ['closed'] };

    const reject: FlowStep = {
      type: 'advance',
      action: CM_ACTIONS.REJECT_AND_CLOSE,
      fields: {},
      description: reason,
      expectStatus: 'Canceled',
      expectFields: {},
      cancels: true,
    };
    try {
      if (status === 'Assignment') return { steps: [reject], warnings: [] };
      if (status === 'Assigned') {
        return {
          steps: [
            this.returnToAssignment(CANCEL_UNAVAILABLE),
            { ...reject, failMessage: CHAIN_FAILED_CANCEL },
          ],
          warnings: [],
        };
      }
    } catch (error) {
      if (error instanceof HttpException) return { error };
      throw error;
    }
    return {
      error: new ConflictException(
        'Solo se puede cancelar un correctivo en asignación o asignado sin empezar',
      ),
    };
  }

  async execute(
    sessionId: string,
    card: CorrectiveMaintCard,
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
    } else {
      await this.gateway.saveFields(sessionId, card._id, {
        activityId,
        fields:
          step.type === 'save' ? step.fields : { ExecStartDate: step.value },
      });
    }
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
