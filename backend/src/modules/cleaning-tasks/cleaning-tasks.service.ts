import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
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
const SUPERVISOR_ROLES = ['SuperUser', 'Admin'];
const ALLOWED_UPLOAD_PHASES = ['InExecution', 'Completed'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 10;

@Injectable()
export class CleaningTasksService {
  constructor(
    private readonly hostawayService: HostawayService,
    private readonly openmaintService: CleaningTasksOpenmaintService,
  ) {}

  async getCheckouts(date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const response = await this.hostawayService.getCheckoutsByDate(targetDate);
    return {
      date: targetDate,
      checkouts: response.result.map((r) => ({
        reservationId: r.reservationId,
        guestName: r.guestName,
        listingName: r.listingName,
        listingId: r.listingId,
        checkoutDate: r.checkoutDate,
        checkoutTime: r.checkoutTime,
      })),
      count: response.count,
    };
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
        observations: task.Observations ?? null,
        hostawayReservationId: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        generatedDate: task.GeneratedDate,
      })),
    };
  }

  async createCleaningTask(dto: CreateCleaningTaskDto) {
    const exists = await this.openmaintService.taskExistsByReservationId(dto.hostawayReservationId);
    if (exists) {
      return { created: false, message: `Ya existe una tarea para la reserva ${dto.hostawayReservationId}` };
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
      throw new InternalServerErrorException(`Error al crear tarea para reserva ${dto.hostawayReservationId}`);
    }
  }

  async generateTasksFromCheckouts(checkouts: CreateCleaningTaskDto[]) {
    const results = await Promise.allSettled(checkouts.map((c) => this.createCleaningTask(c)));
    return {
      created: results.filter((r) => r.status === 'fulfilled' && r.value.created).length,
      skipped: results.filter((r) => r.status === 'fulfilled' && !r.value.created).length,
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
        checkoutTime: r.checkoutTime,
        guestName: r.guestName,
      }));
    return { dateFrom, dateTo, ...(await this.generateTasksFromCheckouts(checkouts)) };
  }

  // ─── Todas las tareas (supervisor) ────────────────────────────────────────

  async getAllTasks(
    sessionToken: string,
    options: { limit?: number; offset?: number; phase?: string; date?: string; employeeId?: number } = {},
  ) {
    const { limit = 50, offset = 0 } = options;
    const response = await this.openmaintService.getAllTasks(options);
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [...new Set(rawTasks.map((t) => t.Unit).filter((u): u is number => u != null))];
    const unitResults = await Promise.all(uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)));
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      assignedDate: task.AssignedDate ?? null,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      observations: task.Observations ?? null,
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee ? { id: task.Employee, name: task._Employee_description ?? '' } : null,
    }));
    return { success: true, data: tasks, meta: { total: response.meta?.total ?? tasks.length, limit, offset } };
  }

  // ─── Tareas por empleado ──────────────────────────────────────────────────

  async getMyTasks(employeeId: number, sessionToken: string, limit = 50, offset = 0) {
    const response = await this.openmaintService.getTasksByEmployee(employeeId, sessionToken, limit, offset);
    const rawTasks = response.data ?? [];
    const uniqueUnitIds = [...new Set(rawTasks.map((t) => t.Unit).filter((u): u is number => u != null))];
    const unitResults = await Promise.all(uniqueUnitIds.map((id) => this.fetchUnitInfo(id, sessionToken)));
    const unitMap = new Map(uniqueUnitIds.map((id, i) => [id, unitResults[i]]));
    const tasks = rawTasks.map((task) => ({
      id: task._id,
      type: task._type ?? 'CleaningTask',
      taskNumber: task.TaskNumber,
      description: task.Description ?? null,
      phase: task._phase_description ?? task.phase,
      generatedDate: task.GeneratedDate,
      assignedDate: task.AssignedDate ?? null,
      plannedStartTime: task.PlannedStartTime ?? null,
      plannedEndTime: task.PlannedEndTime ?? null,
      actualStartTime: task.ActualStartTime ?? null,
      actualEndTime: task.ActualEndTime ?? null,
      observations: task.Observations ?? null,
      hostawayReservation: task.HostawayReservation ?? null,
      checkoutDate: task.CheckoutDate ?? null,
      source: task._Source_description ?? task.Source ?? null,
      unit: task.Unit != null ? (unitMap.get(task.Unit) ?? null) : null,
      employee: task.Employee ? { id: task.Employee, name: task._Employee_description ?? '' } : null,
    }));
    return { success: true, data: tasks, meta: { total: response.meta?.total ?? tasks.length, limit, offset } };
  }

  // ─── Detalle de tarea ─────────────────────────────────────────────────────

  async getTaskDetail(taskId: number, employeeId: number, sessionToken: string) {
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return this.buildTaskDetail(task, sessionToken);
  }

  async getTaskDetailAsSupervisor(taskId: number, sessionToken: string) {
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    return this.buildTaskDetail(task, sessionToken);
  }

  private async buildTaskDetail(task: any, sessionToken: string) {
    const phaseDesc = task._phase_description ?? String(task.phase);
    const phaseId = PHASE_DESC_TO_ID[phaseDesc] ?? null;
    const [attResponse, checklistDetail, unitInfo] = await Promise.all([
      this.openmaintService.getAttachments(task._id, sessionToken).catch(() => null),
      this.fetchChecklistDetail(task.CleaningChecklist),
      task.Unit != null ? this.fetchUnitInfo(task.Unit, sessionToken) : Promise.resolve(null),
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
        assignedDate: task.AssignedDate ?? null,
        plannedStartTime: task.PlannedStartTime ?? null,
        plannedEndTime: task.PlannedEndTime ?? null,
        actualStartTime: task.ActualStartTime ?? null,
        actualEndTime: task.ActualEndTime ?? null,
        observations: task.Observations ?? null,
        hostawayReservation: task.HostawayReservation ?? null,
        checkoutDate: task.CheckoutDate ?? null,
        source: task._Source_description ?? task.Source ?? null,
        unit: unitInfo,
        employee: task.Employee ? { id: task.Employee, name: task._Employee_description ?? '' } : null,
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
      const response = await this.openmaintService.getUnitById(unitId, sessionToken);
      const unit = response?.data;
      if (!unit) return null;
      return { id: unit._id, code: unit.Code ?? null, description: unit.Description ?? null, name: unit.Name ?? null };
    } catch {
      return null;
    }
  }

  private async fetchChecklistDetail(activityId: number | null | undefined) {
    if (!activityId) return null;
    try {
      const response = await this.openmaintService.getCleaningActivity(activityId);
      const act = response?.data;
      if (!act) return null;
      return {
        id: act._id,
        code: act.Code ?? null,
        description: act.Description ?? null,
        templateName: act.NombrePlantilla ?? null,
        activities: act.Detalle ? act.Detalle.split('\n').map((l) => l.trim()).filter(Boolean) : [],
      };
    } catch {
      return null;
    }
  }

  // ─── Transiciones de fase ─────────────────────────────────────────────────

  async startTask(taskId: number, employeeId: number, sessionToken: string) {
    const task = await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.IN_EXECUTION);
    const now = new Date().toISOString();
    const response = await this.openmaintService.updateTaskWithSession(
      taskId, { phase: PHASE_IDS.IN_EXECUTION, ActualStartTime: now }, sessionToken,
    );
    return {
      success: true,
      data: { id: response?.data?._id ?? taskId, phase: PHASE_NAMES[PHASE_IDS.IN_EXECUTION], actualStartTime: response?.data?.ActualStartTime ?? now },
    };
  }

  async completeTask(taskId: number, employeeId: number, dto: CompleteTaskDto, sessionToken: string) {
    const task = await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    const phaseDesc = task._phase_description ?? String(task.phase);
    this.validatePhaseTransition(phaseDesc, PHASE_IDS.COMPLETED);
    if (!task.ActualStartTime) throw new BadRequestException('Task must be started before completing');
    const now = new Date().toISOString();
    const body: Record<string, unknown> = { phase: PHASE_IDS.COMPLETED, ActualEndTime: now };
    if (dto.observations) body.Observations = dto.observations;
    const response = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: response?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.COMPLETED],
        actualEndTime: response?.data?.ActualEndTime ?? now,
        observations: dto.observations ?? null,
        duration: this.calculateDurationMinutes(task.ActualStartTime, now),
      },
    };
  }

  async reviewTask(taskId: number, role: string, dto: ReviewTaskDto, sessionToken: string) {
    if (!SUPERVISOR_ROLES.includes(role)) throw new ForbiddenException('Only supervisors can review tasks');
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (phaseDesc !== 'Completed') throw new BadRequestException('Task must be in Completed state to review');
    const targetPhaseId = dto.approved ? PHASE_IDS.REVIEWED : PHASE_IDS.IN_EXECUTION;
    const body: Record<string, unknown> = { phase: targetPhaseId };
    if (dto.reviewComments) body.Notes = dto.reviewComments;
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: { id: updated?.data?._id ?? taskId, phase: PHASE_NAMES[targetPhaseId], reviewComments: dto.reviewComments ?? null },
    };
  }

  /**
   * Reabre una tarea cambiándola a InExecution.
   * Los tiempos originales (ActualStartTime) se conservan intactos.
   * Fases válidas: Completed, Reviewed.
   * Solo SuperUser/Admin.
   */
  async reopenTask(taskId: number, role: string, dto: ReopenTaskDto, sessionToken: string) {
    if (!SUPERVISOR_ROLES.includes(role)) throw new ForbiddenException('Only supervisors can reopen tasks');
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Completed', 'Reviewed'].includes(phaseDesc)) {
      throw new BadRequestException(
        `Solo se pueden reabrir tareas en estado Completed o Reviewed. Estado actual: ${phaseDesc}`,
      );
    }
    const body: Record<string, unknown> = { phase: PHASE_IDS.IN_EXECUTION };
    if (dto.observations) body.Observations = dto.observations;
    const updated = await this.openmaintService.updateTaskWithSession(taskId, body, sessionToken);
    return {
      success: true,
      data: {
        id: updated?.data?._id ?? taskId,
        phase: PHASE_NAMES[PHASE_IDS.IN_EXECUTION],
        observations: dto.observations ?? null,
        previousPhase: phaseDesc,
      },
    };
  }

  async cancelTask(taskId: number, role: string, dto: CancelTaskDto, sessionToken: string) {
    if (!SUPERVISOR_ROLES.includes(role)) throw new ForbiddenException('Only supervisors can cancel tasks');
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!['Assigned', 'InExecution'].includes(phaseDesc)) {
      throw new BadRequestException('Only tasks in Assigned or InExecution state can be cancelled');
    }
    const updated = await this.openmaintService.updateTaskWithSession(taskId, { phase: PHASE_IDS.CANCELLED, Notes: dto.reason }, sessionToken);
    return {
      success: true,
      data: { id: updated?.data?._id ?? taskId, phase: PHASE_NAMES[PHASE_IDS.CANCELLED], cancelReason: dto.reason },
    };
  }

  // ─── Attachments ──────────────────────────────────────────────────────────

  async getAttachments(taskId: number, employeeId: number, sessionToken: string, category?: string) {
    await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  async getAttachmentsAsSupervisor(taskId: number, sessionToken: string, category?: string) {
    return this.buildAttachmentsList(taskId, sessionToken, category);
  }

  private async buildAttachmentsList(taskId: number, sessionToken: string, category?: string) {
    const response = await this.openmaintService.getAttachments(taskId, sessionToken);
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
    return { success: true, data: attachments, meta: { total: attachments.length } };
  }

  async uploadAttachment(taskId: number, employeeId: number, file: UploadedFile, dto: UploadAttachmentDto, sessionToken: string) {
    const task = await this.fetchAndValidateOwnership(taskId, employeeId, sessionToken);
    const phaseDesc = task._phase_description ?? String(task.phase);
    if (!ALLOWED_UPLOAD_PHASES.includes(phaseDesc)) throw new BadRequestException('Photos can only be uploaded when task is InExecution or Completed');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) throw new BadRequestException('Only jpg, jpeg, png, heic files are allowed');
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException('File size must not exceed 10MB');
    const existing = await this.openmaintService.getAttachments(taskId, sessionToken);
    if ((existing.data?.length ?? 0) >= MAX_ATTACHMENTS) throw new BadRequestException(`Maximum ${MAX_ATTACHMENTS} photos allowed per task`);
    const categoryCode = dto.category ?? 'Photo';
    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'jpg';
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const response = await this.openmaintService.uploadAttachment(taskId, file.buffer, uniqueName, file.mimetype, categoryCode, sessionToken);
    const att = response?.data;
    return {
      success: true,
      data: { id: att?._id ?? null, fileName: att?.fileName ?? uniqueName, category: categoryCode, uploadDate: att?.created ?? new Date().toISOString() },
    };
  }

  async streamAttachment(taskId: number, attachmentId: string, sessionToken: string, res: any): Promise<void> {
    const { data, contentType, fileName } = await this.openmaintService.downloadAttachment(taskId, attachmentId, sessionToken);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async fetchAndValidateOwnership(taskId: number, employeeId: number, sessionToken: string) {
    const response = await this.openmaintService.getTaskById(taskId, sessionToken);
    const task = response?.data;
    if (!task) throw new NotFoundException(`Tarea ${taskId} no encontrada`);
    this.validateOwnership(task.Employee, employeeId);
    return task;
  }

  private validateOwnership(taskEmployee: number | undefined, employeeId: number): void {
    if (taskEmployee !== employeeId) throw new ForbiddenException('This task is not assigned to you');
  }

  private validatePhaseTransition(currentPhaseDesc: string, targetPhaseId: PhaseId): void {
    const currentPhaseId = PHASE_DESC_TO_ID[currentPhaseDesc];
    if (!currentPhaseId) throw new BadRequestException(`Unknown current phase: ${currentPhaseDesc}`);
    const allowed = PHASE_TRANSITIONS[currentPhaseId] ?? [];
    if (!allowed.includes(targetPhaseId)) {
      throw new BadRequestException(`Invalid phase transition from ${currentPhaseDesc} to ${PHASE_NAMES[targetPhaseId]}`);
    }
  }

  private calculateDurationMinutes(startIso: string, endIso: string): number {
    return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
  }

  // ─── Actualización directa ────────────────────────────────────────────────

  async updateCleaningTask(taskId: number, dto: UpdateCleaningTaskDto) {
    const body: Record<string, unknown> = {};
    if (dto.phase) body.phase = dto.phase;
    if (dto.employeeId) body.Employee = Number(dto.employeeId);
    if (dto.plannedStartTime) body.PlannedStartTime = dto.plannedStartTime;
    if (dto.plannedEndTime) body.PlannedEndTime = dto.plannedEndTime;
    if (dto.actualStartTime) body.ActualStartTime = dto.actualStartTime;
    if (dto.actualEndTime) body.ActualEndTime = dto.actualEndTime;
    if (dto.observations) body.Observations = dto.observations;
    if (dto.employeeId) body.AssignedDate = new Date().toISOString().split('T')[0];
    const response = await this.openmaintService.updateCleaningTask(taskId, body);
    return { updated: true, taskId: response.data?._id ?? taskId };
  }
}
