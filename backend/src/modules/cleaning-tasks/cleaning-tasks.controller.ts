import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CleaningTasksService } from './cleaning-tasks.service';
import { CancelTaskDto } from './dto/cancel-task.dto';
import { CompleteTaskDto } from './dto/complete-task.dto';
import { CreateCleaningTaskDto } from './dto/create-cleaning-task.dto';
import { GetAllCleaningTasksQueryDto } from './dto/get-all-cleaning-tasks-query.dto';
import { GetCleaningTasksQueryDto } from './dto/get-cleaning-tasks-query.dto';
import { ReopenTaskDto } from './dto/reopen-task.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { UpdateCleaningTaskDto } from './dto/update-cleaning-task.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

@Controller('cleaning-tasks')
export class CleaningTasksController {
  constructor(private readonly cleaningTasksService: CleaningTasksService) {}

  // ─── Todas las tareas (supervisor) ─────────────────────────────────────────

  /**
   * GET /cleaning-tasks/all?phase=Completed&date=2026-04-16&employeeId=123&limit=50&offset=0
   * Devuelve todas las tareas de limpieza. Solo accesible por SuperUser o Admin.
   */
  @Get('all')
  async getAllTasks(
    @Query(new ValidationPipe({ transform: true })) query: GetAllCleaningTasksQueryDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.getAllTasks(sessionToken, {
      limit: query.limit,
      offset: query.offset,
      phase: query.phase,
      date: query.date,
      employeeId: query.employeeId,
    });
  }

  // ─── Tareas del empleado autenticado (sesión del usuario) ────────────────

  /**
   * GET /cleaning-tasks/mine?limit=50&offset=0
   * Devuelve las tareas asignadas al empleado de limpieza autenticado.
   */
  @Get('mine')
  async getMyTasks(
    @Query(new ValidationPipe({ transform: true })) query: GetCleaningTasksQueryDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.getMyTasks(
      employeeId,
      sessionToken,
      query.limit,
      query.offset,
    );
  }

  // ─── Hostaway checkouts (lectura) ─────────────────────────────────────────

  @Get('checkouts')
  async getCheckouts(@Query('date') date?: string) {
    return this.cleaningTasksService.getCheckouts(date);
  }

  // ─── Sincronización Hostaway → OpenMAINT ──────────────────────────────────

  /**
   * POST /cleaning-tasks/sync/today
   * Sincroniza los checkouts del día actual.
   */
  @Post('sync/today')
  async syncToday() {
    const today = new Date().toISOString().split('T')[0];
    return this.cleaningTasksService.syncFromHostaway(today, today);
  }

  /**
   * POST /cleaning-tasks/sync
   * Body: { dateFrom?: string, dateTo?: string }
   */
  @Post('sync')
  async sync(@Body() body: { dateFrom?: string; dateTo?: string }) {
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = body.dateFrom ?? today;
    const dateTo = body.dateTo ?? today;
    return this.cleaningTasksService.syncFromHostaway(dateFrom, dateTo);
  }

  // ─── Tareas de limpieza (CRUD — sistema) ──────────────────────────────────

  @Get()
  async getCleaningTasks(@Query('date') date?: string) {
    return this.cleaningTasksService.getCleaningTasks(date);
  }

  @Post()
  async createCleaningTask(
    @Body(new ValidationPipe({ transform: true })) dto: CreateCleaningTaskDto,
  ) {
    return this.cleaningTasksService.createCleaningTask(dto);
  }

  @Post('generate')
  async generateTasks(@Body() body: { checkouts: CreateCleaningTaskDto[] }) {
    return this.cleaningTasksService.generateTasksFromCheckouts(body.checkouts);
  }

  @Put(':id')
  async updateCleaningTask(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true })) dto: UpdateCleaningTaskDto,
  ) {
    return this.cleaningTasksService.updateCleaningTask(id, dto);
  }

  // ─── Detalle y transiciones de tarea (sesión del usuario) ─────────────────
  // IMPORTANTE: estas rutas deben estar después de las estáticas para evitar
  // que ":taskId" capture "mine", "checkouts", etc.

  /**
   * GET /cleaning-tasks/:taskId
   * Detalle completo de una tarea con attachments y flags de acción.
   * - Empleado: requiere x-cleaning-employee-id y valida que la tarea le pertenezca.
   * - SuperUser/Admin: no requiere x-cleaning-employee-id, omite validación de ownership.
   */
  @Get(':taskId')
  async getTaskDetail(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string | undefined,
    @Headers('x-role') role: string | undefined,
  ) {
    this.requireSessionToken(sessionToken);

    const isSupervisor = role === 'SuperUser' || role === 'Admin';

    if (isSupervisor) {
      return this.cleaningTasksService.getTaskDetailAsSupervisor(taskId, sessionToken);
    }

    const employeeId = this.parseEmployeeId(cleaningEmployeeId);
    return this.cleaningTasksService.getTaskDetail(taskId, employeeId, sessionToken);
  }

  /**
   * PATCH /cleaning-tasks/:taskId/start
   * Transición Assigned → InExecution. Registra ActualStartTime.
   */
  @Patch(':taskId/start')
  async startTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.startTask(taskId, employeeId, sessionToken);
  }

  /**
   * PATCH /cleaning-tasks/:taskId/complete
   * Transición InExecution → Completed. Registra ActualEndTime y observaciones.
   */
  @Patch(':taskId/complete')
  async completeTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: CompleteTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    return this.cleaningTasksService.completeTask(taskId, employeeId, dto, sessionToken);
  }

  /**
   * PATCH /cleaning-tasks/:taskId/review
   * Transición Completed → Reviewed (o de vuelta a InExecution si rejected).
   * Solo para SuperUser/Admin.
   */
  @Patch(':taskId/review')
  async reviewTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: ReviewTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.reviewTask(taskId, role, dto, sessionToken);
  }

  /**
   * PATCH /cleaning-tasks/:taskId/reopen
   * Reabre una tarea (Completed o Reviewed) cambiándola a InExecution.
   * Los tiempos originales se conservan. Solo SuperUser/Admin.
   * Body: { observations?: string }
   */
  @Patch(':taskId/reopen')
  async reopenTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: ReopenTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);
    return this.cleaningTasksService.reopenTask(taskId, role, dto, sessionToken);
  }

  /**
   * PATCH /cleaning-tasks/:taskId/cancel
   * Cancela una tarea en estado Assigned o InExecution.
   * Solo para SuperUser/Admin.
   */
  @Patch(':taskId/cancel')
  async cancelTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body(new ValidationPipe({ transform: true })) dto: CancelTaskDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-role') role: string,
  ) {
    this.requireSessionToken(sessionToken);
    this.requireRole(role);

    return this.cleaningTasksService.cancelTask(taskId, role, dto, sessionToken);
  }

  /**
   * GET /cleaning-tasks/:taskId/attachments?category=Photo
   * Lista los attachments de una tarea.
   * - Empleado: requiere x-cleaning-employee-id y valida ownership.
   * - SuperUser/Admin: no requiere x-cleaning-employee-id, acceso directo.
   */
  @Get(':taskId/attachments')
  async getAttachments(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Query('category') category?: string,
    @Headers('x-session-token') sessionToken?: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId?: string,
    @Headers('x-role') role?: string,
  ) {
    this.requireSessionToken(sessionToken);

    const isSupervisor = role === 'SuperUser' || role === 'Admin';

    if (isSupervisor) {
      return this.cleaningTasksService.getAttachmentsAsSupervisor(
        taskId,
        sessionToken!,
        category,
      );
    }

    const employeeId = this.parseEmployeeId(cleaningEmployeeId);
    return this.cleaningTasksService.getAttachments(
      taskId,
      employeeId,
      sessionToken!,
      category,
    );
  }

  /**
   * GET /cleaning-tasks/:taskId/attachments/:attachmentId/download?token=SESSION_TOKEN
   * Descarga/proxea el binario de un attachment desde OpenMAINT.
   * Acepta el token como query param para poder usarse en <img src>.
   */
  @Get(':taskId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Param('attachmentId') attachmentId: string,
    @Query('token') tokenFromQuery: string | undefined,
    @Headers('x-session-token') tokenFromHeader: string | undefined,
    @Res() res: Response,
  ) {
    const sessionToken = tokenFromHeader ?? tokenFromQuery;
    if (!sessionToken) {
      throw new UnauthorizedException('Session token is required');
    }

    return this.cleaningTasksService.streamAttachment(
      taskId,
      attachmentId,
      sessionToken,
      res,
    );
  }

  /**
   * POST /cleaning-tasks/:taskId/attachments
   * Sube una fotografía. Content-Type: multipart/form-data.
   * Campo "file": binario. Campo "category": Photo | Image (opcional).
   */
  @Post(':taskId/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('taskId', ParseIntPipe) taskId: number,
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @Body(new ValidationPipe({ transform: true })) dto: UploadAttachmentDto,
    @Headers('x-session-token') sessionToken: string,
    @Headers('x-cleaning-employee-id') cleaningEmployeeId: string,
  ) {
    this.requireSessionToken(sessionToken);
    const employeeId = this.parseEmployeeId(cleaningEmployeeId);

    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.cleaningTasksService.uploadAttachment(
      taskId,
      employeeId,
      file,
      dto,
      sessionToken,
    );
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private requireSessionToken(token: string | undefined): void {
    if (!token) {
      throw new UnauthorizedException('Session token is required');
    }
  }

  private requireRole(role: string | undefined): void {
    if (!role) {
      throw new ForbiddenException('Role header is required');
    }
  }

  private parseEmployeeId(value: string | undefined): number {
    if (!value) {
      throw new BadRequestException('Cleaning employee ID is required');
    }
    const id = parseInt(value, 10);
    if (isNaN(id)) {
      throw new BadRequestException('Invalid cleaning employee ID');
    }
    return id;
  }
}
