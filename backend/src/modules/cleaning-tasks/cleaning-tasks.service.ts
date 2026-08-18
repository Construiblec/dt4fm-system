import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HostawayService } from '../../integrations/hostaway/hostaway.service';
import { CleaningTasksOpenmaintService } from './cleaning-tasks.openmaint.service';
import {
  PHASE_DESC_TO_ID,
  PHASE_IDS,
  PHASE_NAMES,
  PHASE_TRANSITIONS,
  PhaseId,
} from './constants/phase.constants';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateCleaningTaskDto } from './dto/create-cleaning-task.dto';
import { GetCheckoutsQueryDto } from './dto/get-checkouts-query.dto';
import { ReopenTaskDto } from './dto/reopen-task.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { UpdateCleaningTaskDto } from './dto/update-cleaning-task.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

/** Tipo mínimo del archivo subido por multer (evita dependencia de @types/multer) */
type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const PHASE_LOOKUP = { Assigned: 'Assigned' };
const SOURCE_LOOKUP = { Hostaway: 'Hostaway', Manual: 'Manual' };
/**
 * Códigos de rol de openMAINT (el login devuelve el Code, no la Description).
 * `SuperUser` es el administrador; no existe un rol con Code `Admin`.
 */
export const SUPERVISOR_ROLES = ['SuperUser', 'SupervisorLimpieza'];

export const isSupervisorRole = (role?: string) =>
  Boolean(role && SUPERVISOR_ROLES.includes(role));
const ALLOWED_UPLOAD_PHASES = ['InExecution', 'Completed'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;
/** Tope defensivo, en minutos, para el tiempo de una sola ejecución reportado por el front. */
const MAX_SESSION_MINUTES = 1440;
/** Ventana máxima consultable de checkouts, para acotar el costo hacia Hostaway. */
const MAX_CHECKOUT_RANGE_DAYS = 92;

@Injectable()
export class CleaningTasksService {
  private readonly logger = new Logger(CleaningTasksService.name);

  constructor(
    private readonly hostawayService: HostawayService,
    private readonly openmaintService: CleaningTasksOpenmaintService,
  ) {}

  /**
   * Lectura de checkouts desde Hostaway, en un día o en un rango.
   *
   * Acepta `date` (un solo día, comportamiento histórico) o el par
   * `dateFrom`/`dateTo`. Si no llega nada, consulta hoy.
   * El campo `date` de la respuesta se conserva para no romper a los
   * clientes que ya lo leen.
   */
  async getCheckouts(query: GetCheckoutsQueryDto = {}) {
    const today = new Date().toISOString().split('T')[0];

    const dateFrom = query.dateFrom ?? query.date ?? today;
    const dateTo = query.dateTo ?? query.date ?? dateFrom;

    if (dateTo < dateFrom) {
      throw new BadRequestException(
        `El rango es inválido: dateTo (${dateTo}) es anterior a dateFrom (${dateFrom})`,
      );
    }

    const spanDays = this.countDaysInclusive(dateFrom, dateTo);
    if (spanDays > MAX_CHECKOUT_RANGE_DAYS) {
      throw new BadRequestException(
        `El rango solicitado (${spanDays} días) supera el máximo de ${MAX_CHECKOUT_RANGE_DAYS} días`,
      );
    }

    const response = await this.hostawayService.getCheckouts(dateFrom, dateTo);

    const checkouts = response.result
      .map((r) => ({
        reservationId: r.reservationId,
        guestName: r.guestName,
        listingName: r.listingName,
        listingId: r.listingId,
        checkoutDate: r.checkoutDate,
        checkoutTime: r.checkoutTime,
      }))
      .sort(
        (a, b) =>
          a.checkoutDate.localeCompare(b.checkoutDate) ||
          a.listingName.localeCompare(b.listingName),
      );

    return {
      date: dateFrom,
      dateFrom,
      dateTo,
      checkouts,
      count: checkouts.length,
    };
  }

  /** Días que abarca [from, to] inclusive, calculado en UTC. */
  private countDaysInclusive(from: string, to: string): number {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);

    if (isNaN(start) || isNaN(end)) {
      throw new BadRequestException(
        'Las fechas deben tener formato YYYY-MM-DD',
      );
    }

    return Math.floor((end - start) / 86_400_000) + 1;
  }

  async getCleaningTasks(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const response = await this.openmaintService.getCleaningTasks(targetDate);
    return {
      tasks: (response.data ?? []).map((task) => ({
        id: task._id,
        taskNumber: task.TaskNumber,
        phase: task._phase_description ?? task.phase,
        unit: task._Unit_description ?? String(task.Unit ?? ''),
        employee: task._Employee_description ?? String(task.Employee ?? ''),
        plannedStartTime: task.PlannedStartTime ?? null,
        plannedEndTime: task.PlannedEndTime ?? null,
        actualStartTime: task.ActualStartTime ?? null,
        actualEndTime: task.ActualEndTime ?? null,
        executionTime: task.ExecutionTime ?? null,
        delayTime: task.DelayTime ?? null,
        taskObservations: task.Observations ?? null,
        supervisionObserv: task.SupervisionObserv ?? null,
        teamObservations: task.TeamObservations ?? null,
        hostawayReservationId: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        generatedDate: task.GeneratedDate,
      })),
    };
  }

  async createCleaningTask(dto: CreateCleaningTaskDto) {
    const exists = await this.openmaintService.taskExistsByReservationId(
      dto.hostawayReservationId,
    );
    if (exists) {
      return {
        created: false,
        message: `Ya existe una tarea para la reserva ${dto.hostawayReservationId}`,
      };
    }
    const today = new Date().toISOString().split('T')[0];
    const body: Record<string, unknown> = {
      TaskNumber: `CT.${new Date().getFullYear()}.${Date.now().toString().slice(-4)}`,
      phase: PHASE_LOOKUP.Assigned,
      GeneratedDate: today,
      CheckoutDate: dto.checkoutDate,
      HostawayReservation: dto.hostawayReservationId,
      Source: SOURCE_LOOKUP.Hostaway,
      Description: `Limpieza - ${dto.listingName}`,
    };
    if (dto.plannedStartTime) body.PlannedStartTime = dto.plannedStartTime;
    if (dto.plannedEndTime) body.PlannedEndTime = dto.plannedEndTime;
    try {
      const response = await this.openmaintService.createCleaningTask(body);
      return {
        created: true,
        taskId: response.data?._id ?? null,
        taskNumber: response.data?.TaskNumber ?? null,
        reservationId: dto.hostawayReservationId,
      };
    } catch {
      throw new InternalServerErrorException(
        `Error al crear tarea para reserva ${dto.hostawayReservationId}`,
      );
    }
  }

  async generateTasksFromCheckouts(checkouts: CreateCleaningTaskDto[]) {
    const results = await Promise.allSettled(
      checkouts.map((c) => this.createCleaningTask(c)),
    );
    return {
      created: results.filter(
        (r) => r.status === 'fulfilled' && r.value.created,
      ).length,
      skipped: results.filter(
        (r) => r.status === 'fulfilled' && !r.value.created,
      ).length,
      failed: results.filter((r) => r.status === 'rejected').length,
      total: checkouts.length,
    };
  }

  // ─── Sincronización desde Hostaway ────────────────────────────────────────

  async syncFromHostaway(dateFrom: string, dateTo: string) {
    const response = await this.hostawayService.getCheckouts(dateFrom, dateTo);
    const checkouts: CreateCleaningTaskDto[] = response.result
      .filter((r) => !!r.reservationId)
      .map((r) => ({
        hostawayReservationId: r.reservationId,
        listingName: r.listingName,
        listingId: r.listingId,
        checkoutDate: r.checkoutDate,
        checkoutTime: this.normalizeCheckoutTime(r.checkoutTime),
        guestName: r.guestName,
      }));
    return {
      dateFrom,
      dateTo,
      ...(await this.generateTasksFromCheckouts(checkouts)),
    };
  }

  /**
   * Hostaway devuelve checkOutTime como entero (11 = 11:00) mientras que el
   * mock y el DTO lo expresan como texto 'HH:MM'. Unificamos a texto.
   */
  private normalizeCheckoutTime(value: string | number): string {
    if (typeof value === 'number') {
      return `${String(value).padStart(2, '0')}:00`;
    }
    return value.includes(':') ? value : `${value.padStart(2, '0')}:00`;
  }

  // ─── Todas las tareas (supervisor) ────────────────────────────────────────

  async getAllTasks(
    sessionToken: string,
    options: {
      limit?: number;
      offset?: number;
      phase?: string;
      date?: string;
      employeeId?: number;
    } = {},
  ) {
    const { limit = 50, offset = 0 } = options;
    const response = await this.openmaintService.getAllTasks(options);
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [
      ...new Set(
        rawTasks.map((t) => t.Unit).filter((u): u is number => u != null),
      ),
    ];
    const unitResults = await Promise.all(
      uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)),
    );
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      executionTime: task.ExecutionTime ?? null,
      delayTime: task.DelayTime ?? null,
      taskObservations: task.Observations ?? null,
      supervisionObserv: task.SupervisionObserv ?? null,
      teamObservations: task.TeamObservations ?? null,
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee
        ? { id: task.Employee, name: task._Employee_description ?? '' }
        : null,
    }));
    return {
      success: true,
      data: tasks,
      meta: { total: response.meta?.total ?? tasks.length, limit, offset },
    };
  }

  // ─── Tareas por empleado ──────────────────────────────────────────────────

  async getMyTasks(
    employeeId: number,
    sessionToken: string,
    limit = 50,
    offset = 0,
  ) {
    const response = await this.openmaintService.getTasksByEmployee(
      employeeId,
      sessionToken,
      limit,
      offset,
    );
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [
      ...new Set(
        rawTasks.map((t) => t.Unit).filter((u): u is number => u != null),
      ),
    ];
    const unitResults = await Promise.all(
      uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)),
    );
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      executionTime: task.ExecutionTime ?? null,
      delayTime: task.DelayTime ?? null,
      taskObservations: task.Observations ?? null,
      supervisionObserv: task.SupervisionObserv ?? null,
      teamObservations: task.TeamObservations ?? null,
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee
        ? { id: task.Employee, name: task._Employee_description ?? '' }
        : null,
    }));
    return {
      success: true,
      data: tasks,
      meta: { total: response.meta?.total ?? tasks.length, limit, offset },
    };
  }

  // ─── Detalle de tarea ─────────────────────────────────────────────────────

  async getTaskDetail(
    taskId: number,
    employeeId: number,
    sessionToken: string,
  ) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return this.buildTaskDetail(task, sessionToken);
  }

  async getTaskDetailAsSupervisor(taskId: number, sessionToken: string) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    return this.buildTaskDetail(task, sessionToken);
  }

  private async buildTaskDetail(task: any, sessionToken: string) {
    const phaseDesc = task._phase_description ?? String(task.phase);
    const phaseId = PHASE_DESC_TO_ID[phaseDesc] ?? null;
    const [attResponse, checklistDetail, unitInfo] = await Promise.all([
      this.openmaintService
        .getAttachments(task._id, sessionToken)
        .catch(() => null),
      this.fetchChecklistDetail(task.CleaningChecklist),
      task.Unit != null
        ? this.fetchUnitInfo(task.Unit, sessionToken)
        : Promise.resolve(null),
    ]);
    const attachments = (attResponse?.data ?? []).map((a) => ({
      id: a._id,
      fileName: a.fileName,
      category: a._category_description ?? a.category,
      uploadDate: a.created ?? a.modified ?? null,
    }));
    return {
      success: true,
      data: {
        id: task._id,
        type: task._type ?? 'CleaningTask',
        taskNumber: task.TaskNumber,
        description: task.Description ?? null,
        phase: phaseDesc,
        phaseId,
        generatedDate: task.GeneratedDate,
        plannedStartTime: task.PlannedStartTime ?? null,
        plannedEndTime: task.PlannedEndTime ?? null,
        actualStartTime: task.ActualStartTime ?? null,
        actualEndTime: task.ActualEndTime ?? null,
        executionTime: task.ExecutionTime ?? null,
        delayTime: task.DelayTime ?? null,
        taskObservations: task.Observations ?? null,
        supervisionObserv: task.SupervisionObserv ?? null,
        teamObservations: task.TeamObservations ?? null,
        hostawayReservation: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        unit: unitInfo,
        employee: task.Employee
          ? { id: task.Employee, name: task._Employee_description ?? '' }
          : null,
        attachments,
        canStart: phaseDesc === 'Assigned',
        canComplete: phaseDesc === 'InExecution',
        canReview: phaseDesc === 'Completed',
        canReopen: phaseDesc === 'Completed' || phaseDesc === 'Reviewed',
        canCancel: phaseDesc === 'Assigned' || phaseDesc === 'InExecution',
        checklistDetail,
      },
    };
  }

  private async fetchUnitInfo(unitId: number, sessionToken: string) {
    try {
      const response = await this.openmaintService.getUnitById(
        unitId,
        sessionToken,
      );
      const unit = response?.data;
      if (!unit) return null;
      return {
        id: unit._id,
        code: unit.Code ?? null,
        description: unit.Description ?? null,
        name: unit.Name ?? null,
      };
    } catch {
      return null;
    }
  }

  private async fetchChecklistDetail(activityId: number | null | undefined) {
    if (!activityId) return null;
    try {
      const response =
        await this.openmaintService.getCleaningActivity(activityId);
      const act = response?.data;
      if (!act) return null;
      return {
        id: act._id,
        code: act.Code ?? null,
        description: act.Description ?? null,
        templateName: act.NombrePlantilla ?? null,
        activities: act.Detalle
          ? act.Detalle.split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
          : [],
      };
    } catch {
      return null;
    }
  }

  // ─── Transiciones de fase ─────────────────────────────────────────────────

  async startTask(taskId: number, employeeId: number, sessionToken: string) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.IN_EXECUTION);
    const now = new Date().toISOString();
    
    const body: Record<string, unknown> = { phase: PHASE_IDS.IN_EXECUTION };

    // ActualStartTime y DelayTime se registran UNA SOLA VEZ: en el primer inicio real.
    // Una tarea reabierta ya trae historial, así que no se recalculan y el retraso
    // original se conserva (de lo contrario el retraso crecería en cada reapertura,
    // porque se mediría contra la fecha en que se reinició, no la del primer inicio).
    const hasRunBefore =
      !!task.ActualStartTime ||
      this.toNumber(task.ExecutionTime) > 0 ||
      this.toNumber(task.DelayTime) > 0;

    if (!hasRunBefore) {
      body.ActualStartTime = now;

      const delayMinutes = task.PlannedStartTime
        ? this.calculateDurationMinutes(task.PlannedStartTime, now)
        : 0;
      if (delayMinutes > 0) {
        body.DelayTime = this.roundMinutes(delayMinutes);
      }
    }

    const response = await this.openmaintService.updateTaskWithSession(
      taskId,
      body,
      sessionToken,
    );
    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.IN_EXECUTION],
        actualStartTime: response?.data?.ActualStartTime ?? task.ActualStartTime ?? now,
      },
    };
  }

  async completeTask(
    taskId: number,
    employeeId: number,
    dto: CompleteTaskDto,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.COMPLETED);
    if (!task.ActualStartTime)
      throw new BadRequestException('Task must be started before completing');
    const now = new Date().toISOString();
    const prevExecution = this.toNumber(task.ExecutionTime);
    const sessionMinutes = this.resolveExecutionMinutes(taskId, task, dto, prevExecution, now);
    const executionTime = this.roundMinutes(prevExecution + sessionMinutes);

    const body: Record<string, unknown> = {
      phase: PHASE_IDS.COMPLETED,
      ActualEndTime: now,
      ExecutionTime: executionTime,
    };
    if (dto.observations) {
      body.TeamObservations = this.appendNote(task.TeamObservations, dto.observations);
    }
    const response = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.COMPLETED],
        actualEndTime: response?.data?.ActualEndTime ?? now,
        observations: dto.observations ?? null,
        duration: Math.round(sessionMinutes),
        executionTime: this.toNumber(response?.data?.ExecutionTime) || executionTime,
      },
    };
  }

  /**
   * Minutos trabajados en ESTA ejecución, los que se sumarán al acumulado.
   *
   * La fuente es el cronómetro del front, que arranca en cero cuando el empleado
   * toca "Iniciar" en la tarjeta. Se mide allá de punta a punta con el mismo reloj,
   * así que no le afecta un desfase horario entre el dispositivo y el servidor.
   *
   * Respaldos cuando el front no manda el dato:
   * - Primera ejecución: ActualStartTime es el arranque de esta única sesión y sirve.
   * - Tarea reabierta: ActualStartTime apunta al primer inicio histórico; usarlo
   *   sumaría los días que la tarea estuvo cerrada, así que se acumula 0.
   */
  private resolveExecutionMinutes(
    taskId: number,
    task: any,
    dto: CompleteTaskDto,
    prevExecution: number,
    now: string,
  ): number {
    const reported = dto.executionMinutes;
    if (typeof reported === 'number' && isFinite(reported) && reported >= 0) {
      if (reported > MAX_SESSION_MINUTES) {
        this.logger.warn(
          `Tarea ${taskId}: el front reportó ${reported} min de ejecución, por encima del ` +
            `máximo de ${MAX_SESSION_MINUTES} min. Se acota para no corromper el acumulado.`,
        );
        return MAX_SESSION_MINUTES;
      }
      return reported;
    }

    const wasReopened = prevExecution > 0;
    if (!wasReopened && task.ActualStartTime) {
      return Math.max(0, this.calculateDurationMinutes(task.ActualStartTime, now));
    }

    this.logger.warn(
      `Tarea ${taskId}: se completó sin executionMinutes y no es deducible (acumulado ` +
        `actual: ${prevExecution} min). No se acumula tiempo para no inflar ExecutionTime.`,
    );
    return 0;
  }

  async reviewTask(
    taskId: number,
    role: string,
    dto: ReviewTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can review tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (phaseDesc !== 'Completed')
      throw new BadRequestException(
        'Task must be in Completed state to review',
      );
    const targetPhaseId = dto.approved
      ? PHASE_IDS.REVIEWED
      : PHASE_IDS.ASSIGNED;
    const body: Record<string, unknown> = { phase: targetPhaseId };
    
    if (!dto.approved) {
      body.ActualEndTime = null;
    }

    if (dto.reviewComments) {
      body.Notes = dto.reviewComments;
    }

    // La nota queda siempre como bitácora, con o sin comentarios.
    const prefix = dto.approved ? '[Aprobado]' : '[Reabierto]';
    const comments = dto.reviewComments?.trim();
    body.SupervisionObserv = this.appendNote(
      task.SupervisionObserv,
      comments ? `${prefix}: ${comments}` : prefix,
    );
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[targetPhaseId],
        reviewComments: dto.reviewComments ?? null,
      },
    };
  }

  /**
   * Reabre una tarea cambiándola a Assigned.
   * El empleado debe volver a iniciarla manualmente (startTask).
   *
   * ActualStartTime y DelayTime NO se tocan: siguen describiendo el primer inicio
   * real y su retraso. Solo se limpia ActualEndTime porque la tarea vuelve a estar
   * pendiente. El tiempo de la nueva sesión se suma al ExecutionTime ya acumulado
   * cuando el empleado vuelve a completarla.
   *
   * Fases válidas: Completed, Reviewed. Solo SuperUser/SupervisorLimpieza.
   */
  async reopenTask(
    taskId: number,
    role: string,
    dto: ReopenTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can reopen tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Completed', 'Reviewed'].includes(phaseDesc)) {
      throw new BadRequestException(
        `Solo se pueden reabrir tareas en estado Completed o Reviewed. Estado actual: ${phaseDesc}`,
      );
    }
    const body: Record<string, unknown> = { 
      phase: PHASE_IDS.ASSIGNED,
      ActualEndTime: null,
    };
    // La nota queda siempre como bitácora, con o sin motivo. Ninguna vista depende
    // ya de este texto para saber si la tarea fue reabierta: eso se deduce de los datos.
    const reason = dto.observations?.trim();
    body.SupervisionObserv = this.appendNote(
      task.SupervisionObserv,
      reason ? `[Reabierto]: ${reason}` : '[Reabierto]',
    );
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.ASSIGNED],
        observations: dto.observations ?? null,
        previousPhase: phaseDesc,
      },
    };
  }

  async cancelTask(
    taskId: number,
    role: string,
    dto: CancelTaskDto,
    sessionToken: string,
  ) {
    if (!SUPERVISOR_ROLES.includes(role))
      throw new ForbiddenException('Only supervisors can cancel tasks');
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Assigned', 'InExecution'].includes(phaseDesc)) {
      throw new BadRequestException(
        'Only tasks in Assigned or InExecution state can be cancelled',
      );
    }
    const updated = await this.openmaintService.updateTaskWithSession(
      taskId,
      { phase: PHASE_IDS.CANCELLED, Notes: dto.reason },
      sessionToken,
    );
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.CANCELLED],
        cancelReason: dto.reason,
      },
    };
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  async getAttachments(
    taskId: number,
    employeeId: number,
    sessionToken: string,
    category?: string,
  ) {
    await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  async getAttachmentsAsSupervisor(
    taskId: number,
    sessionToken: string,
    category?: string,
  ) {
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  private async buildAttachmentsList(
    taskId: number,
    sessionToken: string,
    category?: string,
  ) {
    const response = await this.openmaintService
      .getAttachments(taskId, sessionToken)
      .catch(() => ({ data: [] }));
    let attachments = (response.data ?? []).map((a) => ({
      id: a._id,
      fileName: a.fileName,
      category: a._category_description ?? a.category,
      uploadDate: a.created ?? a.modified ?? null,
      downloadUrl: `/cleaning-tasks/${taskId}/attachments/${a._id}/download`,
    }));
    if (category && category !== 'all') {
      attachments = attachments.filter((a) => a.category === category);
    }
    return {
      success: true,
      data: attachments,
      meta: { total: attachments.length },
    };
  }

  async uploadAttachment(
    taskId: number,
    employeeId: number,
    file: UploadedFile,
    dto: UploadAttachmentDto,
    sessionToken: string,
  ) {
    const task = await this.fetchAndValidateOwnership(
      taskId,
      employeeId,
      sessionToken,
    );
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!ALLOWED_UPLOAD_PHASES.includes(phaseDesc))
      throw new BadRequestException(
        'Photos can only be uploaded when task is InExecution or Completed',
      );
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype))
      throw new BadRequestException(
        'Only jpg, jpeg, png, heic files are allowed',
      );
    if (file.size > MAX_FILE_SIZE_BYTES)
      throw new BadRequestException('File size must not exceed 10MB');
    const existing = await this.openmaintService.getAttachments(
      taskId,
      sessionToken,
    );
    if ((existing.data?.length ?? 0) >= MAX_ATTACHMENTS)
      throw new BadRequestException(
        `Maximum ${MAX_ATTACHMENTS} photos allowed per task`,
      );
    const categoryCode = dto.category ?? 'Photo';
    const ext = file.originalname.includes('.')
      ? file.originalname.split('.').pop()
      : 'jpg';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const response = await this.openmaintService.uploadAttachment(
      taskId,
      file.buffer,
      uniqueName,
      file.mimetype,
      categoryCode,
      sessionToken,
    );
    const att = response?.data;
    return {
      success: true,
      data: {
        id: att?._id ?? null,
        fileName: att?.fileName ?? uniqueName,
        category: categoryCode,
        uploadDate: att?.created ?? new Date().toISOString(),
      },
    };
  }

  async streamAttachment(
    taskId: number,
    attachmentId: string,
    sessionToken: string,
    res: any,
  ): Promise<void> {
    const { data, contentType, fileName } =
      await this.openmaintService.downloadAttachment(
        taskId,
        attachmentId,
        sessionToken,
      );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async fetchAndValidateOwnership(
    taskId: number,
    employeeId: number,
    sessionToken: string,
  ) {
    const response = await this.openmaintService.getTaskById(
      taskId,
      sessionToken,
    );
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return task;
  }

  private validateOwnership(
    taskEmployee: number | undefined,
    employeeId: number,
  ): void {
    if (taskEmployee !== employeeId)
      throw new ForbiddenException('This task is not assigned to you');
  }

  private validatePhaseTransition(
    currentPhaseDesc: string,
    targetPhaseId: PhaseId,
  ): void {
    const currentPhaseId = PHASE_DESC_TO_ID[currentPhaseDesc];
    if (!currentPhaseId)
      throw new BadRequestException(
        `Unknown current phase: ${currentPhaseDesc}`,
      );
    const allowed = PHASE_TRANSITIONS[currentPhaseId] ?? [];
    if (!allowed.includes(targetPhaseId)) {
      throw new BadRequestException(
        `Invalid phase transition from ${currentPhaseDesc} to ${PHASE_NAMES[targetPhaseId]}`,
      );
    }
  }

  /**
   * Minutos entre dos fechas, con decimales: el redondeo se aplica una sola vez,
   * al escribir en OpenMAINT, para no perder precisión al acumular ejecuciones.
   */
  private calculateDurationMinutes(startIso: string, endIso: string): number {
    return (
      (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000
    );
  }

  /**
   * OpenMAINT puede devolver los campos Double como número o como string.
   * Normaliza a número; cualquier valor no parseable se trata como 0.
   */
  private toNumber(value: unknown): number {
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (value == null || value === '') return 0;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Recorta la precisión de los minutos antes de guardarlos en OpenMAINT:
   * 2 decimales (~0.6 s) bastan y evitan valores como 7.000000000000001.
   */
  private roundMinutes(minutes: number): number {
    return Math.round(minutes * 100) / 100;
  }

  private appendNote(existingText: string | null | undefined, newText: string): string {
    const text = (existingText ?? '').trim();
    const matches = [...text.matchAll(/^Nota (\d+)/gm)];
    let nextNumber = 1;
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      nextNumber = parseInt(lastMatch[1], 10) + 1;
    }
    
    const noteBlock = `Nota ${nextNumber}\n${newText}`;
    if (!text) {
      return noteBlock.substring(0, 500);
    }
    
    const combined = `${text}\n\n${noteBlock}`;
    return combined.length > 500 ? combined.substring(combined.length - 500) : combined;
  }

  // ─── Actualización directa ────────────────────────────────────────────────

  /**
   * Escribe en OpenMAINT solo los campos que llegan en el dto.
   *
   * Asignar un empleado NO toca `PlannedStartTime`. Antes se sobrescribía con
   * la hora actual, lo que tenía dos efectos malos: borraba el horario previsto
   * que vive en OpenMAINT, y pisaba incluso un `plannedStartTime` enviado
   * explícitamente en la misma petición. Como consecuencia, el retraso que
   * calcula `startTask` se medía contra el momento de la asignación en vez de
   * contra el horario planificado, y siempre salía cercano a cero.
   *
   * Para fijar una hora planificada hay que mandarla en `plannedStartTime`.
   */
  async updateCleaningTask(taskId: number, dto: UpdateCleaningTaskDto) {
    const body: Record<string, unknown> = {};
    if (dto.phase) body.phase = dto.phase;
    if (dto.employeeId) body.Employee = Number(dto.employeeId);
    if (dto.plannedStartTime) body.PlannedStartTime = dto.plannedStartTime;
    if (dto.plannedEndTime) body.PlannedEndTime = dto.plannedEndTime;
    if (dto.actualStartTime) body.ActualStartTime = dto.actualStartTime;
    if (dto.actualEndTime) body.ActualEndTime = dto.actualEndTime;
    if (dto.executionTime != null) body.ExecutionTime = dto.executionTime;
    if (dto.observations) body.Observations = dto.observations;

    const response = await this.openmaintService.updateCleaningTask(
      taskId,
      body,
    );
    return { updated: true, taskId: response.data?._id ?? taskId };
  }
}
