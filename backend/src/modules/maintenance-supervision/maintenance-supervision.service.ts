import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import {
  PM_ACTIONS,
  PM_STATUS_CODE_TO_NAME,
  PM_STATUS_IDS,
  PM_STATUS_NAME_TO_ID,
  PmStatusId,
} from '../preventive-maintenance/constants/preventive-maint.constants';
import {
  PreventiveMaintCard,
  PreventiveMaintenanceOpenmaintService,
} from '../preventive-maintenance/preventive-maintenance.openmaint.service';
import {
  CM_ACTIONS,
  CM_ASSIGNEE_WRITABLE_STATUS,
  CM_DERIVED_ASSIGNED,
  CM_PENDING_REVIEW_STATUS,
  CM_PLANNED_START_WRITABLE_STATUS,
  CM_PRIORITY_CODES,
  CM_STATUS_CODE_TO_NAME,
  CM_STATUS_IDS,
  CM_STATUS_NAME_TO_ID,
  CmStatusId,
} from './constants/corrective-maint.constants';
import { SUPPLIER_EMPLOYEE_TYPE } from './constants/supervision-roles.constants';
import {
  CorrectiveMaintCard,
  CorrectiveMaintOpenmaintService,
} from './corrective-maint.openmaint.service';
import { AssignAssigneeDto } from './dto/assign-assignee.dto';
import { ListMaintenancesQueryDto } from './dto/list-maintenances-query.dto';
import { RejectMaintenanceDto } from './dto/reject-maintenance.dto';
import { ReviewMaintenanceDto } from './dto/review-maintenance.dto';

/** Contrato público común a correctivos y preventivos. */
export type SupervisedMaintenance = {
  id: number;
  kind: 'corrective' | 'preventive';
  number: string | null;
  subject: string | null;
  /** Nombre estable del estado, independiente del idioma de la sesión */
  statusCode: string | null;
  /** Etiqueta ya traducida por OpenMAINT */
  status: string | null;
  isClosed: boolean;
  site: string | null;
  assignee: { id: number; name: string } | null;
  team: { id: number; name: string } | null;
  /**
   * Solo la traen los correctivos. El atributo existe en `PreventiveMaint`
   * pero está siempre nulo en la instancia, así que ahí llega `null`.
   */
  priority: { code: string; label: string } | null;
  openingDate: string | null;
  /** `ExpExecStartDate`: cuándo se planificó empezar */
  plannedStart: string | null;
  /**
   * `DueExecEndDate`. Solo lo traen los preventivos: en correctivos está
   * siempre nulo, así que la UI no debe pintar una fila vacía.
   */
  dueDate: string | null;
  /** Sigue abierto y ya pasó su fecha límite */
  isOverdue: boolean;
  execStartDate: string | null;
  execEndDate: string | null;
};

export type Assignee = {
  id: number;
  name: string;
  team: { id: number; name: string } | null;
  /** Un proveedor pertenece a un solo equipo: sus trabajos no se reasignan */
  isSupplier: boolean;
};

type Kind = 'corrective' | 'preventive';

@Injectable()
export class MaintenanceSupervisionService {
  private readonly logger = new Logger(MaintenanceSupervisionService.name);

  constructor(
    private readonly corrective: CorrectiveMaintOpenmaintService,
    private readonly preventive: PreventiveMaintenanceOpenmaintService,
    private readonly openmaint: OpenmaintService,
  ) {}

  // ── Listados ───────────────────────────────────────────────────────────────

  async listCorrective(sessionId: string, query: ListMaintenancesQueryDto) {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const statusIds = query.status
      ? [this.resolveCorrectiveStatus(query.status)]
      : undefined;

    const response = await this.call(
      () =>
        this.corrective.findAll(sessionId, {
          limit,
          offset,
          statusIds,
          assigned: query.assigned,
        }),
      'Error al consultar mantenimientos correctivos en OpenMAINT',
    );

    const cards = response.data ?? [];

    return {
      success: true,
      data: cards.map((card) => this.toCorrective(card)),
      meta: {
        total: response.meta?.total ?? cards.length,
        limit,
        offset,
        pendingReview: await this.countPendingReview(sessionId),
      },
    };
  }

  async listPreventive(sessionId: string, query: ListMaintenancesQueryDto) {
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;
    const statusIds = query.status
      ? [this.resolvePreventiveStatus(query.status)]
      : undefined;

    const response = await this.call(
      () =>
        this.preventive.findAll(sessionId, {
          limit,
          offset,
          statusIds,
          assigned: query.assigned,
        }),
      'Error al consultar mantenimientos preventivos en OpenMAINT',
    );

    const cards = response.data ?? [];

    return {
      success: true,
      data: cards.map((card) => this.toPreventive(card)),
      meta: {
        total: response.meta?.total ?? cards.length,
        limit,
        offset,
        // El preventivo no tiene paso de revisión: `PM03-Advance` cierra
        // directo y un proceso cerrado ya no admite acciones.
        pendingReview: null,
      },
    };
  }

  /**
   * Detalle de un mantenimiento, en solo lectura.
   *
   * Existe en vez de reutilizar `GET /preventive-maintenance/:id` porque la
   * página del técnico llama a `POST /:id/start` al montar, y eso **avanza el
   * flujo**: el supervisor no puede provocar esa transición solo por abrir un
   * detalle.
   */
  async getDetail(sessionId: string, kind: Kind, id: number) {
    if (kind === 'corrective') {
      return {
        success: true,
        data: this.toCorrective(await this.fetchCorrective(sessionId, id)),
      };
    }

    return {
      success: true,
      data: this.toPreventive(await this.fetchPreventive(sessionId, id)),
    };
  }

  /**
   * Candidatos a cesionario. Sin `teamId` devuelve todos, que es lo que
   * necesita el selector de equipo del modal de asignación (los equipos se
   * derivan de aquí porque el rol no tiene permiso de lectura sobre `Team`).
   */
  async listAssignees(sessionId: string, teamId?: number): Promise<{
    success: boolean;
    data: Assignee[];
    meta: { total: number };
  }> {
    const response = await this.call(
      () => this.openmaint.getEmployees(sessionId, teamId),
      'Error al consultar empleados en OpenMAINT',
    );

    const data = (response.data ?? []).map((employee) => ({
      id: employee._id,
      name: employee.Description ?? String(employee._id),
      team:
        employee.Team != null
          ? {
              id: employee.Team,
              name: employee._Team_description ?? String(employee.Team),
            }
          : null,
      isSupplier: employee._type === SUPPLIER_EMPLOYEE_TYPE,
    }));

    return { success: true, data, meta: { total: data.length } };
  }

  // ── Asignación ─────────────────────────────────────────────────────────────

  /**
   * Asigna cesionario y equipo a un correctivo (`CM02-Advance`).
   *
   * Ojo con el efecto colateral: este avance deja la instancia en
   * `CM-Execution` y OpenMAINT rellena `ExecStartDate` con la fecha prevista.
   * El mapeo público lo compensa exponiendo el estado derivado «Assigned»
   * mientras no haya un inicio real — ver `toCorrective`.
   */
  async assignCorrective(
    sessionId: string,
    id: number,
    dto: AssignAssigneeDto,
  ) {
    const card = await this.fetchCorrectiveWithTask(sessionId, id);

    this.assertStatusIn(
      card.ProcessStatus,
      [CM_STATUS_IDS.ASSIGNMENT],
      'El correctivo no está en el paso de asignación',
    );

    const fields: Record<string, unknown> = { Assignee: dto.assigneeId };

    if (dto.teamId !== undefined) {
      fields.Team = dto.teamId;
    }

    if (dto.plannedStart) {
      fields.ExpExecStartDate = dto.plannedStart;
    }

    await this.call(
      () =>
        this.corrective.advance(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          action: CM_ACTIONS.ASSIGN,
          notes: dto.notes ?? null,
          fields,
        }),
      'Error al asignar el correctivo en OpenMAINT',
    );

    const updated = await this.assertCorrectiveReached(
      sessionId,
      id,
      CM_STATUS_IDS.EXECUTION,
      'OpenMAINT aceptó la petición pero no aplicó la asignación del correctivo',
    );

    return { success: true, data: this.toCorrective(updated) };
  }

  /** Rechaza y cierra un correctivo sin ejecutarlo (`CM02-Reject`). */
  async rejectCorrective(
    sessionId: string,
    id: number,
    dto: RejectMaintenanceDto,
  ) {
    const card = await this.fetchCorrectiveWithTask(sessionId, id);

    this.assertStatusIn(
      card.ProcessStatus,
      [CM_STATUS_IDS.ASSIGNMENT],
      'Solo se puede rechazar un correctivo que está en asignación',
    );

    await this.call(
      () =>
        this.corrective.advance(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          action: CM_ACTIONS.REJECT_AND_CLOSE,
          notes: dto.notes,
        }),
      'Error al rechazar el correctivo en OpenMAINT',
    );

    const updated = await this.assertCorrectiveReached(
      sessionId,
      id,
      CM_STATUS_IDS.CANCELED,
      'OpenMAINT aceptó la petición pero no cerró el correctivo',
    );

    return { success: true, data: this.toCorrective(updated) };
  }

  /**
   * Asigna cesionario a un preventivo (`PM01-Advance`).
   *
   * `Team` **no es escribible en ningún paso** de `PreventiveMaint`, así que
   * `dto.teamId` se ignora deliberadamente: el equipo sale del plan.
   */
  async assignPreventive(
    sessionId: string,
    id: number,
    dto: AssignAssigneeDto,
  ) {
    const card = await this.fetchPreventiveWithTask(sessionId, id);

    this.assertStatusIn(
      card.ProcessStatus,
      [PM_STATUS_IDS.PLANNING],
      'El preventivo no está en planificación',
    );

    if (dto.teamId !== undefined) {
      this.logger.warn(
        `Se ignora teamId=${dto.teamId} en el preventivo ${id}: Team no es ` +
          'escribible en PreventiveMaint',
      );
    }

    await this.call(
      () =>
        this.preventive.advance(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          action: PM_ACTIONS.ASSIGN,
          notes: dto.notes ?? null,
          fields: { Assignee: dto.assigneeId },
        }),
      'Error al asignar el preventivo en OpenMAINT',
    );

    const updated = await this.assertPreventiveReached(
      sessionId,
      id,
      PM_STATUS_IDS.ACCEPTANCE,
      'OpenMAINT aceptó la petición pero no aplicó la asignación del preventivo',
    );

    return { success: true, data: this.toPreventive(updated) };
  }

  /**
   * Cambia el cesionario sin mover el flujo. `Assignee` es escribible en todos
   * los pasos abiertos de ambos procesos, así que basta un `saveFields`; no
   * hace falta la acción `*-Return`, que además obligaría a avanzar.
   *
   * El equipo nunca cambia: solo se elige otra persona dentro del mismo.
   */
  async updateAssignee(
    sessionId: string,
    kind: Kind,
    id: number,
    assigneeId: number,
  ) {
    const nextAssignee = await this.findAssignee(sessionId, assigneeId);

    if (nextAssignee.isSupplier) {
      throw new ConflictException(
        'No se puede asignar a un proveedor por esta vía: pertenece a un solo equipo',
      );
    }

    if (kind === 'corrective') {
      const card = await this.fetchCorrectiveWithTask(sessionId, id);

      this.assertStatusIn(
        card.ProcessStatus,
        CM_ASSIGNEE_WRITABLE_STATUS,
        'El correctivo está en un paso que no permite cambiar el cesionario',
      );

      await this.assertReassignable(sessionId, card.Assignee, card.Team, nextAssignee);

      await this.call(
        () =>
          this.corrective.saveFields(sessionId, id, {
            activityId: this.requireActivityId(card._tasklist, id),
            fields: { Assignee: assigneeId },
          }),
        'Error al reasignar el correctivo en OpenMAINT',
      );

      const updated = await this.fetchCorrective(sessionId, id);
      return { success: true, data: this.toCorrective(updated) };
    }

    const card = await this.fetchPreventiveWithTask(sessionId, id);

    if ((card._FlowStatus_code ?? '').startsWith('closed')) {
      throw new ConflictException(
        'El preventivo está cerrado y ya no admite cambios',
      );
    }

    await this.assertReassignable(sessionId, card.Assignee, card.Team, nextAssignee);

    await this.call(
      () =>
        this.preventive.saveFields(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          fields: { Assignee: assigneeId },
        }),
      'Error al reasignar el preventivo en OpenMAINT',
    );

    const updated = await this.fetchPreventive(sessionId, id);
    return { success: true, data: this.toPreventive(updated) };
  }

  // ── Revisión de cierre ─────────────────────────────────────────────────────

  /**
   * Aprueba o devuelve un correctivo que espera revisión en `CM05-Accounting`.
   *
   * No existe equivalente en preventivos: `PM03-Advance` cierra el proceso, y
   * un proceso `closed.completed` tiene su tarea en `writable: false` con
   * `performer: "nobody"` — no se puede ni aprobar ni reabrir.
   */
  async reviewCorrective(
    sessionId: string,
    id: number,
    dto: ReviewMaintenanceDto,
  ) {
    if (!dto.approved && !dto.notes?.trim()) {
      throw new BadRequestException(
        'El motivo es obligatorio al rechazar el cierre',
      );
    }

    const card = await this.fetchCorrectiveWithTask(sessionId, id);

    this.assertStatusIn(
      card.ProcessStatus,
      [CM_PENDING_REVIEW_STATUS],
      'El correctivo no está pendiente de revisión',
    );

    await this.call(
      () =>
        this.corrective.advance(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          action: dto.approved
            ? CM_ACTIONS.APPROVE
            : CM_ACTIONS.BACK_TO_ASSIGNMENT,
          notes: dto.notes?.trim() || null,
        }),
      'Error al registrar la revisión en OpenMAINT',
    );

    // Al rechazar sabemos exactamente dónde debe quedar; al aprobar el flujo
    // puede seguir a control o al cierre según la configuración, así que solo
    // comprobamos que se haya movido de Accounting.
    const updated = await this.fetchCorrective(sessionId, id);

    if (updated.ProcessStatus === CM_PENDING_REVIEW_STATUS) {
      this.logger.error(
        `OpenMAINT aceptó la revisión de ${updated.Number ?? id} pero sigue en ` +
          `${updated._ProcessStatus_code}`,
      );
      throw new BadGatewayException(
        'OpenMAINT aceptó la petición pero no aplicó la revisión',
      );
    }

    return { success: true, data: this.toCorrective(updated) };
  }

  // ── Fecha prevista de inicio ───────────────────────────────────────────────

  /** `ExpExecStartDate` solo es escribible en CM02 (correctivo) y PM02 (preventivo). */
  async updatePlannedStart(
    sessionId: string,
    kind: Kind,
    id: number,
    plannedStart: string,
  ) {
    if (kind === 'corrective') {
      const card = await this.fetchCorrectiveWithTask(sessionId, id);

      this.assertStatusIn(
        card.ProcessStatus,
        CM_PLANNED_START_WRITABLE_STATUS,
        'La fecha prevista solo se puede fijar mientras el correctivo está en asignación',
      );

      await this.call(
        () =>
          this.corrective.saveFields(sessionId, id, {
            activityId: this.requireActivityId(card._tasklist, id),
            fields: { ExpExecStartDate: plannedStart },
          }),
        'Error al guardar la fecha prevista en OpenMAINT',
      );

      return { success: true, data: this.toCorrective(await this.fetchCorrective(sessionId, id)) };
    }

    const card = await this.fetchPreventiveWithTask(sessionId, id);

    this.assertStatusIn(
      card.ProcessStatus,
      [PM_STATUS_IDS.ACCEPTANCE],
      'La fecha prevista solo se puede fijar mientras el preventivo está en asignación',
    );

    await this.call(
      () =>
        this.preventive.saveFields(sessionId, id, {
          activityId: this.requireActivityId(card._tasklist, id),
          fields: { ExpExecStartDate: plannedStart },
        }),
      'Error al guardar la fecha prevista en OpenMAINT',
    );

    return { success: true, data: this.toPreventive(await this.fetchPreventive(sessionId, id)) };
  }

  // ── Mapeo al contrato público ──────────────────────────────────────────────

  private toCorrective(card: CorrectiveMaintCard): SupervisedMaintenance {
    const code = card._ProcessStatus_code ?? null;
    const name = code ? (CM_STATUS_CODE_TO_NAME[code] ?? code) : null;
    const isClosed = (card._FlowStatus_code ?? '').startsWith('closed');
    const dueDate = card.DueExecEndDate ?? null;

    return {
      id: card._id,
      kind: 'corrective',
      number: card.Number ?? null,
      subject: card.ShortDescr ?? null,
      // Asignar avanza CM02 directo a Ejecución, así que OpenMAINT marca el
      // trabajo como en curso antes de que el técnico lo arranque. Mientras no
      // haya un inicio real, la app lo presenta como «Asignado».
      statusCode:
        name === 'Execution' && !card.ExecStartDate ? CM_DERIVED_ASSIGNED : name,
      status:
        card._ProcessStatus_description_translation ??
        card._ProcessStatus_description ??
        null,
      isClosed,
      site: card._Site_description ?? null,
      assignee: this.toRef(card.Assignee, card._Assignee_description),
      team: this.toRef(card.Team, card._Team_description),
      priority: this.toPriority(card),
      openingDate: card.OpeningDate ?? null,
      plannedStart: card.ExpExecStartDate ?? null,
      dueDate,
      isOverdue: this.isOverdue(dueDate, isClosed),
      execStartDate: card.ExecStartDate ?? null,
      execEndDate: card.ExecEndDate ?? null,
    };
  }

  private toPreventive(card: PreventiveMaintCard): SupervisedMaintenance {
    const code = card._ProcessStatus_code ?? null;
    const isClosed = (card._FlowStatus_code ?? '').startsWith('closed');
    const dueDate = card.DueExecEndDate ?? null;

    return {
      id: card._id,
      kind: 'preventive',
      number: card.Number ?? null,
      subject: card.ShortDescr ?? null,
      statusCode: code ? (PM_STATUS_CODE_TO_NAME[code] ?? code) : null,
      status:
        card._ProcessStatus_description_translation ??
        card._ProcessStatus_description ??
        null,
      isClosed,
      site: card._Site_description ?? null,
      assignee: this.toRef(card.Assignee, card._Assignee_description),
      team: this.toRef(card.Team, card._Team_description),
      // El atributo existe en PreventiveMaint pero está siempre nulo; se mapea
      // igual para no tratar los dos tipos de forma distinta sin motivo.
      priority: this.toPriority(card),
      openingDate: card.OpeningDate ?? null,
      plannedStart: card.ExpExecStartDate ?? null,
      dueDate,
      isOverdue: this.isOverdue(dueDate, isClosed),
      execStartDate: card.ExecStartDate ?? null,
      execEndDate: card.ExecEndDate ?? null,
    };
  }

  private toRef(id?: number | null, description?: string | null) {
    return id != null ? { id, name: description ?? String(id) } : null;
  }

  /** El `code` sale del ID del lookup; la etiqueta, de lo que traduzca OpenMAINT. */
  private toPriority(card: {
    Priority?: number | null;
    _Priority_description?: string | null;
    _Priority_description_translation?: string | null;
  }) {
    if (card.Priority == null) {
      return null;
    }

    const code = CM_PRIORITY_CODES[card.Priority];

    if (!code) {
      this.logger.warn(
        `Prioridad ${card.Priority} sin código conocido; revisa CM_PRIORITY_IDS`,
      );
      return null;
    }

    return {
      code,
      label:
        card._Priority_description_translation ??
        card._Priority_description ??
        code,
    };
  }

  /** Un mantenimiento está vencido si sigue abierto y ya pasó su fecha límite. */
  private isOverdue(dueDate: string | null, isClosed: boolean): boolean {
    if (isClosed || !dueDate) {
      return false;
    }

    const due = new Date(dueDate).getTime();

    return Number.isFinite(due) && due < Date.now();
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  private resolveCorrectiveStatus(status: string): CmStatusId {
    const id = CM_STATUS_NAME_TO_ID[status];

    if (!id) {
      throw new BadRequestException(`Estado de correctivo no válido: ${status}`);
    }

    return id;
  }

  private resolvePreventiveStatus(status: string): PmStatusId {
    const id = PM_STATUS_NAME_TO_ID[status];

    if (!id) {
      throw new BadRequestException(`Estado de preventivo no válido: ${status}`);
    }

    return id;
  }

  private async countPendingReview(sessionId: string): Promise<number | null> {
    try {
      return await this.corrective.countByStatus(
        sessionId,
        CM_PENDING_REVIEW_STATUS,
      );
    } catch {
      // El contador es informativo: si falla, el listado sigue sirviendo.
      return null;
    }
  }

  private async findAssignee(
    sessionId: string,
    assigneeId: number,
  ): Promise<Assignee> {
    const { data } = await this.listAssignees(sessionId);
    const found = data.find((employee) => employee.id === assigneeId);

    if (!found) {
      throw new NotFoundException('El empleado indicado no existe');
    }

    return found;
  }

  /** El equipo no se cambia: el nuevo cesionario debe ser del mismo. */
  private async assertReassignable(
    sessionId: string,
    currentAssigneeId: number | null | undefined,
    teamId: number | null | undefined,
    next: Assignee,
  ): Promise<void> {
    if (currentAssigneeId != null) {
      const { data } = await this.listAssignees(sessionId);
      const current = data.find((e) => e.id === currentAssigneeId);

      if (current?.isSupplier) {
        throw new ConflictException(
          'El mantenimiento lo atiende un proveedor y no se puede reasignar',
        );
      }
    }

    if (teamId != null && next.team?.id !== teamId) {
      throw new ConflictException(
        'El nuevo cesionario debe pertenecer al mismo equipo de trabajo',
      );
    }
  }

  private assertStatusIn(
    current: number | null | undefined,
    allowed: readonly number[],
    reason: string,
  ): void {
    if (current == null || !allowed.includes(current)) {
      throw new ConflictException(reason);
    }
  }

  private requireActivityId(
    tasklist: { _id: string }[] | undefined,
    id: number,
  ): string {
    const activityId = tasklist?.[0]?._id;

    if (!activityId) {
      throw new ConflictException(
        `El mantenimiento ${id} no tiene una actividad disponible; ` +
          'probablemente ya está cerrado',
      );
    }

    return activityId;
  }

  private async fetchCorrective(sessionId: string, id: number) {
    const response = await this.call(
      () => this.corrective.findById(sessionId, id),
      'Error al consultar el correctivo en OpenMAINT',
    );

    if (!response.data) {
      throw new NotFoundException('Correctivo no encontrado');
    }

    return response.data;
  }

  private async fetchCorrectiveWithTask(sessionId: string, id: number) {
    const response = await this.call(
      () => this.corrective.findWithTasklist(sessionId, id),
      'Error al consultar el correctivo en OpenMAINT',
    );

    if (!response.data) {
      throw new NotFoundException('Correctivo no encontrado');
    }

    return response.data;
  }

  private async fetchPreventive(sessionId: string, id: number) {
    const response = await this.call(
      () => this.preventive.findById(sessionId, id),
      'Error al consultar el preventivo en OpenMAINT',
    );

    if (!response.data) {
      throw new NotFoundException('Preventivo no encontrado');
    }

    return response.data;
  }

  private async fetchPreventiveWithTask(sessionId: string, id: number) {
    const response = await this.call(
      () => this.preventive.findWithTasklist(sessionId, id),
      'Error al consultar el preventivo en OpenMAINT',
    );

    if (!response.data) {
      throw new NotFoundException('Preventivo no encontrado');
    }

    return response.data;
  }

  /**
   * OpenMAINT responde 200 a un `_advance` aunque no avance (por ejemplo si el
   * grupo del usuario no es el performer del paso): guarda los atributos y deja
   * el proceso donde estaba. Sin esta comprobación le diríamos al supervisor
   * que asignó un trabajo que en realidad sigue sin asignar.
   */
  private async assertCorrectiveReached(
    sessionId: string,
    id: number,
    expected: CmStatusId,
    reason: string,
  ): Promise<CorrectiveMaintCard> {
    const card = await this.fetchCorrective(sessionId, id);

    if (card.ProcessStatus !== expected) {
      this.logger.error(
        `OpenMAINT aceptó el avance de ${card.Number ?? id} pero sigue en ` +
          `${card._ProcessStatus_code ?? card.ProcessStatus}`,
      );
      throw new BadGatewayException(reason);
    }

    return card;
  }

  private async assertPreventiveReached(
    sessionId: string,
    id: number,
    expected: PmStatusId,
    reason: string,
  ): Promise<PreventiveMaintCard> {
    const card = await this.fetchPreventive(sessionId, id);

    if (card.ProcessStatus !== expected) {
      this.logger.error(
        `OpenMAINT aceptó el avance de ${card.Number ?? id} pero sigue en ` +
          `${card._ProcessStatus_code ?? card.ProcessStatus}`,
      );
      throw new BadGatewayException(reason);
    }

    return card;
  }

  /** Traduce los fallos de OpenMAINT sin tragarse los 401 de sesión caducada. */
  private async call<T>(operation: () => Promise<T>, reason: string): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (this.getErrorStatus(error) === 401) {
        throw new UnauthorizedException('La sesión de OpenMAINT ha caducado');
      }

      // OpenMAINT devuelve 400 —no 404— cuando la tarjeta no existe o la
      // sesión no tiene permiso para verla. Sin esto saldría un 502, que haría
      // pensar que OpenMAINT está caído.
      if (this.isCardNotFound(error)) {
        throw new NotFoundException('El mantenimiento no existe o no es accesible');
      }

      this.logger.error(reason, error as Error);
      throw new BadGatewayException(reason);
    }
  }

  /** `card not existing or user not authorized to access card` con status 400. */
  private isCardNotFound(error: unknown): boolean {
    if (this.getErrorStatus(error) !== 400) {
      return false;
    }

    const data = (error as { response?: { data?: unknown } })?.response?.data;
    const message = (data as { messages?: { message?: string }[] })?.messages?.[0]
      ?.message;

    return typeof message === 'string' && message.includes('card not existing');
  }

  private getErrorStatus(error: unknown): number | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      typeof error.response.status === 'number'
    ) {
      return error.response.status;
    }

    return undefined;
  }
}
